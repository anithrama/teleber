from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from apps.inventory.models import Warehouse
from apps.procurement.models import SupplierQuotation
from apps.purchasing.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseReceipt,
    PurchaseReceiptItem,
)
from apps.purchasing.services import calculate_purchase_order, create_purchase_receipt


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseOrderItem
        fields = ('id', 'item', 'quantity', 'received_quantity', 'rate', 'tax_rate', 'discount', 'amount')
        read_only_fields = ('id', 'received_quantity', 'amount')


class PurchaseOrderSerializer(serializers.ModelSerializer):
    items = PurchaseOrderItemSerializer(many=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = '__all__'
        read_only_fields = (
            'id', 'subtotal', 'tax_amount', 'discount_amount', 'grand_total',
            'status',
            'created_by', 'approved_by', 'approved_at', 'rejected_by', 'rejected_at',
            'rejection_reason', 'created_at', 'updated_at',
        )

    def validate(self, attrs):
        instance = self.instance
        order_date = attrs.get('order_date', getattr(instance, 'order_date', None))
        expected_date = attrs.get('expected_delivery_date', getattr(instance, 'expected_delivery_date', None))
        if order_date and expected_date and expected_date < order_date:
            raise serializers.ValidationError({'expected_delivery_date': 'Expected delivery cannot be before order date.'})
        quotation = attrs.get('quotation', getattr(instance, 'quotation', None))
        supplier = attrs.get('supplier', getattr(instance, 'supplier', None))
        request = attrs.get('material_request', getattr(instance, 'material_request', None))
        if quotation and (quotation.supplier_id != supplier.id or quotation.material_request_id != request.id):
            raise serializers.ValidationError({'quotation': 'Quotation supplier and material request must match the order.'})
        for line in attrs.get('items', []):
            if line.get('discount', Decimal('0')) > line['quantity'] * line['rate']:
                raise serializers.ValidationError({'items': 'A line discount cannot exceed its gross line value.'})
        if instance and instance.status != PurchaseOrder.Status.DRAFT:
            raise serializers.ValidationError('Only draft purchase orders can be edited.')
        return attrs

    def _replace_items(self, order, items):
        PurchaseOrderItem.objects.filter(purchase_order=order).delete()
        PurchaseOrderItem.objects.bulk_create([
            PurchaseOrderItem(purchase_order=order, **item) for item in items
        ])
        calculate_purchase_order(order)

    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop('items')
        order = PurchaseOrder.objects.create(created_by=self.context['request'].user, **validated_data)
        self._replace_items(order, items)
        return order

    @transaction.atomic
    def update(self, instance, validated_data):
        items = validated_data.pop('items', None)
        instance = super().update(instance, validated_data)
        if items is not None:
            self._replace_items(instance, items)
        return instance


class PurchaseReceiptItemSerializer(serializers.ModelSerializer):
    purchase_order_item = serializers.PrimaryKeyRelatedField(
        queryset=PurchaseOrderItem.objects.select_related('purchase_order', 'item').all()
    )
    ordered_quantity = serializers.DecimalField(max_digits=14, decimal_places=3, read_only=True)
    accepted_quantity = serializers.DecimalField(max_digits=14, decimal_places=3, read_only=True)

    class Meta:
        model = PurchaseReceiptItem
        fields = ('id', 'purchase_order_item', 'ordered_quantity', 'received_quantity', 'rejected_quantity', 'accepted_quantity')
        read_only_fields = ('id', 'ordered_quantity', 'accepted_quantity')


class PurchaseReceiptSerializer(serializers.ModelSerializer):
    items = PurchaseReceiptItemSerializer(many=True)
    received_by = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = PurchaseReceipt
        fields = '__all__'
        read_only_fields = ('id', 'received_by', 'status', 'created_at')

    def validate(self, attrs):
        warehouse = attrs.get('warehouse')
        if warehouse and not warehouse.is_active:
            raise serializers.ValidationError({'warehouse': 'Inactive warehouses cannot receive stock.'})
        items = attrs.get('items', [])
        line_ids = [row['purchase_order_item'].id for row in items]
        if len(line_ids) != len(set(line_ids)):
            raise serializers.ValidationError({'items': 'A purchase order line may appear only once per receipt.'})
        return attrs

    def create(self, validated_data):
        return create_purchase_receipt(data=validated_data, user=self.context['request'].user)


class WarehouseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Warehouse
        fields = '__all__'