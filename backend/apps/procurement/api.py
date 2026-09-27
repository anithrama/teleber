from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.audit.api import AuditedModelViewSet
from apps.audit.services import record_audit
from apps.procurement.models import Item, MaterialRequest, SupplierQuotation
from apps.procurement.serializers import ItemSerializer, MaterialRequestSerializer, SupplierQuotationSerializer


PURCHASE_READ = {'PURCHASE_MANAGER', 'PURCHASE_USER', 'WAREHOUSE_MANAGER', 'ACCOUNTS_USER', 'VIEWER'}
PURCHASE_WRITE = {'PURCHASE_MANAGER', 'PURCHASE_USER'}


class ItemViewSet(AuditedModelViewSet):
    queryset = Item.objects.all()
    serializer_class = ItemSerializer
    read_roles = PURCHASE_READ
    write_roles = PURCHASE_WRITE


class MaterialRequestViewSet(AuditedModelViewSet):
    queryset = MaterialRequest.objects.select_related('requested_by').prefetch_related('items__item')
    serializer_class = MaterialRequestSerializer
    read_roles = PURCHASE_READ
    write_roles = PURCHASE_WRITE
    role_permissions = {
        'approve': {'PURCHASE_MANAGER'},
        'reject': {'PURCHASE_MANAGER'},
    }

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        material_request = self.get_object()
        if material_request.status != MaterialRequest.Status.DRAFT or not material_request.items.exists():
            raise ValidationError({'status': 'Only non-empty draft requests can be submitted.'})
        old_status = material_request.status
        material_request.status = MaterialRequest.Status.SUBMITTED
        material_request.save(update_fields=('status', 'updated_at'))
        record_audit(request.user, 'SUBMIT', material_request, old_data={'status': old_status}, new_data={'status': material_request.status})
        return Response(self.get_serializer(material_request).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        material_request = self.get_object()
        if material_request.status != MaterialRequest.Status.SUBMITTED:
            raise ValidationError({'status': 'Only submitted requests can be approved.'})
        old_status = material_request.status
        material_request.status = MaterialRequest.Status.APPROVED
        material_request.save(update_fields=('status', 'updated_at'))
        record_audit(request.user, 'APPROVE', material_request, old_data={'status': old_status}, new_data={'status': material_request.status})
        return Response(self.get_serializer(material_request).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        material_request = self.get_object()
        reason = str(request.data.get('reason', '')).strip()
        if material_request.status != MaterialRequest.Status.SUBMITTED:
            raise ValidationError({'status': 'Only submitted requests can be rejected.'})
        if not reason:
            raise ValidationError({'reason': 'A rejection reason is required.'})
        old_status = material_request.status
        material_request.status = MaterialRequest.Status.REJECTED
        material_request.remarks = f'{material_request.remarks}\nRejection: {reason}'.strip()
        material_request.save(update_fields=('status', 'remarks', 'updated_at'))
        record_audit(request.user, 'REJECT', material_request, old_data={'status': old_status}, new_data={'status': material_request.status, 'reason': reason})
        return Response(self.get_serializer(material_request).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        material_request = self.get_object()
        if material_request.status not in (MaterialRequest.Status.DRAFT, MaterialRequest.Status.SUBMITTED):
            raise ValidationError({'status': 'Only draft or submitted requests can be cancelled.'})
        old_status = material_request.status
        material_request.status = MaterialRequest.Status.CANCELLED
        material_request.save(update_fields=('status', 'updated_at'))
        record_audit(request.user, 'CANCEL', material_request, old_data={'status': old_status}, new_data={'status': material_request.status})
        return Response(self.get_serializer(material_request).data)


class SupplierQuotationViewSet(AuditedModelViewSet):
    queryset = SupplierQuotation.objects.select_related('supplier', 'material_request').prefetch_related('items__item')
    serializer_class = SupplierQuotationSerializer
    read_roles = PURCHASE_READ
    write_roles = PURCHASE_WRITE

    @action(detail=False, methods=['get'], url_path='compare')
    def compare(self, request):
        request_id = request.query_params.get('material_request')
        if not request_id:
            raise ValidationError({'material_request': 'This query parameter is required.'})
        get_object_or_404(MaterialRequest, pk=request_id)
        quotations = self.get_queryset().filter(material_request_id=request_id).order_by('quotation_number')
        comparisons = []
        for quotation in quotations:
            for line in quotation.items.all():
                comparisons.append({
                    'supplier': quotation.supplier.name,
                    'supplier_id': quotation.supplier_id,
                    'quotation_number': quotation.quotation_number,
                    'item': line.item.name,
                    'item_code': line.item.item_code,
                    'quantity': line.quantity,
                    'rate': line.rate,
                    'tax_rate': line.tax_rate,
                    'tax': line.amount - line.quantity * line.rate,
                    'subtotal': line.quantity * line.rate,
                    'grand_total': quotation.total_amount,
                    'valid_until': quotation.valid_until,
                })
        return Response(comparisons, status=status.HTTP_200_OK)