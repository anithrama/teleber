from django.db import transaction
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.audit.api import AuditedModelViewSet
from apps.audit.services import record_audit
from apps.purchasing.models import PurchaseOrder, PurchaseReceipt
from apps.purchasing.serializers import PurchaseOrderSerializer, PurchaseReceiptSerializer
from apps.purchasing.services import approve_purchase_order, reject_purchase_order


READ_ROLES = {'PURCHASE_MANAGER', 'PURCHASE_USER', 'WAREHOUSE_MANAGER', 'ACCOUNTS_USER', 'VIEWER'}
PURCHASE_ROLES = {'PURCHASE_MANAGER', 'PURCHASE_USER'}


class PurchaseOrderViewSet(AuditedModelViewSet):
    queryset = PurchaseOrder.objects.select_related(
        'supplier', 'material_request', 'quotation', 'created_by', 'approved_by', 'rejected_by'
    ).prefetch_related('items__item')
    serializer_class = PurchaseOrderSerializer
    read_roles = READ_ROLES
    write_roles = PURCHASE_ROLES
    role_permissions = {
        'approve': {'PURCHASE_MANAGER'},
        'reject': {'PURCHASE_MANAGER'},
        'mark_ordered': {'PURCHASE_MANAGER'},
        'cancel': {'PURCHASE_MANAGER'},
    }

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        order = self.get_object()
        if order.status != PurchaseOrder.Status.DRAFT or not order.items.exists():
            raise ValidationError({'status': 'Only complete draft purchase orders can be submitted.'})
        old_status = order.status
        order.status = PurchaseOrder.Status.PENDING_APPROVAL
        order.save(update_fields=('status', 'updated_at'))
        record_audit(request.user, 'SUBMIT', order, old_data={'status': old_status}, new_data={'status': order.status})
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        order = approve_purchase_order(self.get_object().pk, request.user)
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        order = reject_purchase_order(self.get_object().pk, request.user, request.data.get('reason', ''))
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=['post'], url_path='mark-ordered')
    def mark_ordered(self, request, pk=None):
        order = self.get_object()
        if order.status != PurchaseOrder.Status.APPROVED:
            raise ValidationError({'status': 'Only approved purchase orders can be marked ordered.'})
        old_status = order.status
        order.status = PurchaseOrder.Status.ORDERED
        order.save(update_fields=('status', 'updated_at'))
        record_audit(request.user, 'UPDATE', order, old_data={'status': old_status}, new_data={'status': order.status})
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.status not in (PurchaseOrder.Status.DRAFT, PurchaseOrder.Status.PENDING_APPROVAL, PurchaseOrder.Status.APPROVED):
            raise ValidationError({'status': 'This purchase order can no longer be cancelled.'})
        if order.receipts.exists():
            raise ValidationError({'status': 'Purchase orders with receipts cannot be cancelled.'})
        old_status = order.status
        order.status = PurchaseOrder.Status.CANCELLED
        order.save(update_fields=('status', 'updated_at'))
        record_audit(request.user, 'CANCEL', order, old_data={'status': old_status}, new_data={'status': order.status})
        return Response(self.get_serializer(order).data, status=status.HTTP_200_OK)


class PurchaseReceiptViewSet(AuditedModelViewSet):
    queryset = PurchaseReceipt.objects.select_related('purchase_order', 'warehouse', 'received_by').prefetch_related(
        'items__purchase_order_item__item'
    )
    serializer_class = PurchaseReceiptSerializer
    read_roles = READ_ROLES
    write_roles = {'WAREHOUSE_MANAGER'}
    http_method_names = ['get', 'post', 'head', 'options']

    def perform_create(self, serializer):
        serializer.save()