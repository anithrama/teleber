from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from rest_framework import serializers

from apps.procurement.models import (
    Item,
    MaterialRequest,
    MaterialRequestItem,
    SupplierQuotation,
    SupplierQuotationItem,
)

CENT = Decimal('0.01')


def money(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


class ItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = Item
        fields = '__all__'
        read_only_fields = ('id', 'created_at', 'updated_at', 'current_stock')


class MaterialRequestItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaterialRequestItem
        fields = ('id', 'item', 'quantity', 'estimated_rate', 'remarks')
        read_only_fields = ('id',)


class MaterialRequestSerializer(serializers.ModelSerializer):
    items = MaterialRequestItemSerializer(many=True)
    requested_by_name = serializers.CharField(source='requested_by.get_full_name', read_only=True)

    class Meta:
        model = MaterialRequest
        fields = '__all__'
        read_only_fields = ('id', 'requested_by', 'status', 'created_at', 'updated_at')

    def validate(self, attrs):
        if attrs.get('required_date', getattr(self.instance, 'required_date', None)) < attrs.get(
            'request_date', getattr(self.instance, 'request_date', None)
        ):
            raise serializers.ValidationError({'required_date': 'Required date cannot be before the request date.'})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop('items')
        request = MaterialRequest.objects.create(requested_by=self.context['request'].user, **validated_data)
        MaterialRequestItem.objects.bulk_create(
            [MaterialRequestItem(material_request=request, **item) for item in items]
        )
        return request

    @transaction.atomic
    def update(self, instance, validated_data):
        items = validated_data.pop('items', None)
        if instance.status != MaterialRequest.Status.DRAFT:
            raise serializers.ValidationError('Only draft material requests can be edited.')
        instance = super().update(instance, validated_data)
        if items is not None:
            instance.items.all().delete()
            MaterialRequestItem.objects.bulk_create(
                [MaterialRequestItem(material_request=instance, **item) for item in items]
            )
        return instance


class SupplierQuotationItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierQuotationItem
        fields = ('id', 'item', 'quantity', 'rate', 'tax_rate', 'amount')
        read_only_fields = ('id', 'amount')


class SupplierQuotationSerializer(serializers.ModelSerializer):
    items = SupplierQuotationItemSerializer(many=True)

    class Meta:
        model = SupplierQuotation
        fields = '__all__'
        read_only_fields = ('id', 'total_amount', 'created_at', 'updated_at')

    def validate(self, attrs):
        start = attrs.get('quotation_date', getattr(self.instance, 'quotation_date', None))
        end = attrs.get('valid_until', getattr(self.instance, 'valid_until', None))
        if start and end and end < start:
            raise serializers.ValidationError({'valid_until': 'Validity date cannot be before quotation date.'})
        supplier = attrs.get('supplier', getattr(self.instance, 'supplier', None))
        if supplier and supplier.status != supplier.Status.ACTIVE:
            raise serializers.ValidationError({'supplier': 'Inactive suppliers cannot be quoted.'})
        return attrs

    def _save_items(self, quotation, items):
        SupplierQuotationItem.objects.filter(quotation=quotation).delete()
        lines = []
        total = Decimal('0')
        for item_data in items:
            amount = money(item_data['quantity'] * item_data['rate'] * (1 + item_data['tax_rate'] / 100))
            lines.append(SupplierQuotationItem(quotation=quotation, amount=amount, **item_data))
            total += amount
        SupplierQuotationItem.objects.bulk_create(lines)
        quotation.total_amount = money(total)
        quotation.save(update_fields=('total_amount', 'updated_at'))

    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop('items')
        quotation = SupplierQuotation.objects.create(**validated_data)
        self._save_items(quotation, items)
        return quotation

    @transaction.atomic
    def update(self, instance, validated_data):
        items = validated_data.pop('items', None)
        instance = super().update(instance, validated_data)
        if items is not None:
            self._save_items(instance, items)
        return instance