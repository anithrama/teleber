from decimal import Decimal, InvalidOperation

from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.accounting.models import PurchaseInvoice
from apps.accounting.serializers import PurchaseInvoiceSerializer
from apps.accounting.services import process_three_way_match, record_invoice_payment
from apps.audit.api import AuditedModelViewSet


class PurchaseInvoiceViewSet(AuditedModelViewSet):
    queryset = PurchaseInvoice.objects.select_related('supplier', 'purchase_order').prefetch_related('items__item')
    serializer_class = PurchaseInvoiceSerializer
    read_roles = {'PURCHASE_MANAGER', 'ACCOUNTS_USER', 'VIEWER'}
    write_roles = {'ACCOUNTS_USER'}
    role_permissions = {
        'three_way_match': {'ACCOUNTS_USER'},
        'payment': {'ACCOUNTS_USER'},
    }

    def perform_destroy(self, instance):
        if instance.paid_amount > 0:
            raise ValidationError('Invoices with payments cannot be deleted.')
        super().perform_destroy(instance)

    @action(detail=True, methods=['post'], url_path='three-way-match')
    def three_way_match(self, request, pk=None):
        invoice, result = process_three_way_match(self.get_object().pk, request.user)
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def payment(self, request, pk=None):
        try:
            amount = Decimal(str(request.data.get('amount', '')))
        except (InvalidOperation, TypeError):
            raise ValidationError({'amount': 'A valid decimal payment amount is required.'})
        invoice = record_invoice_payment(self.get_object().pk, request.user, amount)
        return Response(self.get_serializer(invoice).data, status=status.HTTP_200_OK)