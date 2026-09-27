from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from rest_framework import serializers

from apps.accounting.models import PurchaseInvoice, PurchaseInvoiceItem
from apps.purchasing.models import PurchaseOrder


def money(value):
    return Decimal(value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


class PurchaseInvoiceItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseInvoiceItem
        fields = ('id', 'item', 'quantity', 'rate', 'tax_rate', 'amount')
        read_only_fields = ('id', 'amount')


class PurchaseInvoiceSerializer(serializers.ModelSerializer):
    items = PurchaseInvoiceItemSerializer(many=True)

    class Meta:
        model = PurchaseInvoice
        fields = '__all__'
        read_only_fields = (
            'id', 'subtotal', 'tax_amount', 'grand_total', 'paid_amount',
            'outstanding_amount', 'status', 'created_at', 'updated_at',
        )

    def validate(self, attrs):
        instance = self.instance
        invoice_date = attrs.get('invoice_date', getattr(instance, 'invoice_date', None))
        due_date = attrs.get('due_date', getattr(instance, 'due_date', None))
        if invoice_date and due_date and due_date < invoice_date:
            raise serializers.ValidationError({'due_date': 'Due date cannot be before invoice date.'})
        purchase_order = attrs.get('purchase_order', getattr(instance, 'purchase_order', None))
        supplier = attrs.get('supplier', getattr(instance, 'supplier', None))
        if purchase_order and supplier and purchase_order.supplier_id != supplier.id:
            raise serializers.ValidationError({'supplier': 'Invoice supplier must match the purchase order supplier.'})
        if instance and instance.paid_amount > 0:
            raise serializers.ValidationError('Paid invoices cannot be edited.')
        return attrs

    def _replace_items(self, invoice, items):
        PurchaseInvoiceItem.objects.filter(invoice=invoice).delete()
        rows = []
        subtotal = Decimal('0')
        tax_amount = Decimal('0')
        for item_data in items:
            base = item_data['quantity'] * item_data['rate']
            tax = base * item_data['tax_rate'] / 100
            amount = money(base + tax)
            subtotal += base
            tax_amount += tax
            rows.append(PurchaseInvoiceItem(invoice=invoice, amount=amount, **item_data))
        PurchaseInvoiceItem.objects.bulk_create(rows)
        invoice.subtotal = money(subtotal)
        invoice.tax_amount = money(tax_amount)
        invoice.grand_total = money(subtotal + tax_amount)
        invoice.outstanding_amount = invoice.grand_total - invoice.paid_amount
        invoice.status = PurchaseInvoice.Status.UNPAID if invoice.paid_amount == 0 else invoice.status
        invoice.save(update_fields=('subtotal', 'tax_amount', 'grand_total', 'outstanding_amount', 'status', 'updated_at'))

    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop('items')
        invoice = PurchaseInvoice.objects.create(
            subtotal=Decimal('0'),
            tax_amount=Decimal('0'),
            grand_total=Decimal('0'),
            outstanding_amount=Decimal('0'),
            **validated_data,
        )
        self._replace_items(invoice, items)
        return invoice

    @transaction.atomic
    def update(self, instance, validated_data):
        items = validated_data.pop('items', None)
        instance = super().update(instance, validated_data)
        if items is not None:
            self._replace_items(instance, items)
        return instance