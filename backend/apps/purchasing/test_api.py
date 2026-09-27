from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.db import IntegrityError
from django.urls import reverse
from rest_framework import status
import yaml

from apps.accounts.models import UserRole
from apps.audit.models import AuditLog
from apps.inventory.models import StockMovement
from apps.procurement.models import SupplierQuotation
from apps.purchasing.models import PurchaseOrder, PurchaseReceipt
from apps.test_support import ProcurementAPITestCase


class PurchaseOrderAPITests(ProcurementAPITestCase):
    def setUp(self):
        super().setUp()
        self.authenticate(UserRole.PURCHASE_USER)

    def test_create_list_retrieve_update_and_calculated_totals(self):
        payload = self.purchase_order_payload('PO-CRUD', items=[{
            'item': self.item.pk, 'quantity': '2', 'rate': '10', 'tax_rate': '10', 'discount': '1',
        }])
        payload['subtotal'] = '1'
        payload['grand_total'] = '1'
        created = self.client.post('/api/purchase-orders/', payload, format='json')
        data = self.assert_success_envelope(created, 201)
        self.assertEqual(Decimal(data['subtotal']), Decimal('20.00'))
        self.assertEqual(Decimal(data['tax_amount']), Decimal('1.90'))
        self.assertEqual(Decimal(data['grand_total']), Decimal('20.90'))
        order_id = data['id']
        self.assert_success_envelope(self.client.get('/api/purchase-orders/'), 200)
        self.assert_success_envelope(self.client.get(f'/api/purchase-orders/{order_id}/'), 200)
        updated = self.client.patch(f'/api/purchase-orders/{order_id}/', {'remarks': 'Updated'}, format='json')
        self.assertEqual(self.assert_success_envelope(updated, 200)['remarks'], 'Updated')

    def test_approval_rejection_and_self_approval(self):
        order, _line = self.create_order(creator=self.users[UserRole.PURCHASE_USER])
        self.authenticate(UserRole.PURCHASE_MANAGER)
        approved = self.client.post(reverse('purchase-order-approve', args=[order.pk]))
        approval_data = self.assert_success_envelope(approved, 200)
        self.assertEqual(approval_data['status'], PurchaseOrder.Status.APPROVED)
        self.assertEqual(approval_data['approved_by'], self.users[UserRole.PURCHASE_MANAGER].pk)
        order.refresh_from_db()
        self.assertIsNotNone(order.approved_at)

        rejected_order, _line = self.create_order(creator=self.users[UserRole.PURCHASE_USER])
        missing_reason = self.client.post(reverse('purchase-order-reject', args=[rejected_order.pk]), {}, format='json')
        self.assert_error_envelope(missing_reason, 400)
        rejected = self.client.post(
            reverse('purchase-order-reject', args=[rejected_order.pk]), {'reason': 'Quote expired'}, format='json'
        )
        self.assertEqual(self.assert_success_envelope(rejected, 200)['status'], PurchaseOrder.Status.REJECTED)
        rejected_order.refresh_from_db()
        self.assertEqual(rejected_order.rejection_reason, 'Quote expired')
        self.assertIsNotNone(rejected_order.rejected_at)

        self_order, _line = self.create_order(creator=self.users[UserRole.PURCHASE_MANAGER])
        self_response = self.client.post(reverse('purchase-order-approve', args=[self_order.pk]))
        self.assert_error_envelope(self_response, 400)
        self_order.refresh_from_db()
        self.assertEqual(self_order.status, PurchaseOrder.Status.PENDING_APPROVAL)

    def test_unauthorized_approval_and_invalid_status_transition(self):
        order, _line = self.create_order()
        unauthorized = self.client.post(reverse('purchase-order-approve', args=[order.pk]))
        self.assert_error_envelope(unauthorized, 403)
        self.authenticate(UserRole.PURCHASE_MANAGER)
        approved_already, _line = self.create_order(status=PurchaseOrder.Status.APPROVED)
        invalid = self.client.post(reverse('purchase-order-approve', args=[approved_already.pk]))
        self.assert_error_envelope(invalid, 400)

    def test_invalid_supplier_quote_quantity_date_and_status(self):
        bad_supplier = self.purchase_order_payload('PO-BAD-SUP', supplier=999999)
        self.assert_error_envelope(self.client.post('/api/purchase-orders/', bad_supplier, format='json'), 400)
        bad_quote = self.purchase_order_payload('PO-BAD-QUOTE', quotation=999999)
        self.assert_error_envelope(self.client.post('/api/purchase-orders/', bad_quote, format='json'), 400)
        bad_quantity = self.purchase_order_payload('PO-BAD-QTY', items=[{
            'item': self.item.pk, 'quantity': '-1', 'rate': '10', 'tax_rate': '0', 'discount': '0',
        }])
        self.assert_error_envelope(self.client.post('/api/purchase-orders/', bad_quantity, format='json'), 400)
        bad_date = self.purchase_order_payload('PO-BAD-DATE', expected_delivery_date='2000-01-01')
        self.assert_error_envelope(self.client.post('/api/purchase-orders/', bad_date, format='json'), 400)
        direct_status = self.purchase_order_payload('PO-STATUS', status='APPROVED')
        created = self.client.post('/api/purchase-orders/', direct_status, format='json')
        self.assertEqual(self.assert_success_envelope(created, 201)['status'], PurchaseOrder.Status.DRAFT)

    def test_duplicate_number_missing_fields_and_invalid_types(self):
        payload = self.purchase_order_payload('PO-DUP')
        self.assert_success_envelope(self.client.post('/api/purchase-orders/', payload, format='json'), 201)
        self.assert_error_envelope(self.client.post('/api/purchase-orders/', payload, format='json'), 400)
        self.assert_error_envelope(self.client.post('/api/purchase-orders/', {'po_number': 'PO-MISSING'}, format='json'), 400)
        invalid = self.purchase_order_payload('PO-BAD-TYPE', order_date='yesterday')
        self.assert_error_envelope(self.client.post('/api/purchase-orders/', invalid, format='json'), 400)

    def test_failed_approval_rolls_back_status_and_audit(self):
        order, _line = self.create_order()
        self.authenticate(UserRole.PURCHASE_MANAGER)
        audit_count = AuditLog.objects.count()
        with patch('apps.purchasing.services.record_audit', side_effect=IntegrityError('audit storage unavailable')):
            response = self.client.post(reverse('purchase-order-approve', args=[order.pk]))

        self.assert_error_envelope(response, 500)
        order.refresh_from_db()
        self.assertEqual(order.status, PurchaseOrder.Status.PENDING_APPROVAL)
        self.assertIsNone(order.approved_at)
        self.assertEqual(AuditLog.objects.count(), audit_count)

    def test_invalid_quotation_supplier_pair_is_rejected(self):
        quote = SupplierQuotation.objects.create(
            quotation_number='SQ-WRONG-PO', supplier=self.alternate_supplier,
            material_request=self.material_request, quotation_date=date.today(),
            valid_until=date.today(),
        )
        payload = self.purchase_order_payload('PO-QUOTE-MISMATCH', quotation=quote.pk)
        response = self.client.post('/api/purchase-orders/', payload, format='json')
        self.assert_error_envelope(response, 400)


class PurchaseReceiptAPITests(ProcurementAPITestCase):
    def receipt_payload(self, order, line, number='PR-API', quantity='2'):
        return {
            'receipt_number': number,
            'purchase_order': order.pk,
            'warehouse': self.warehouse.pk,
            'receipt_date': date.today().isoformat(),
            'items': [{
                'purchase_order_item': line.pk,
                'received_quantity': quantity,
                'rejected_quantity': '0',
            }],
        }

    def test_valid_receipt_api_updates_stock_and_creates_movement(self):
        order, line = self.create_order(status=PurchaseOrder.Status.ORDERED)
        self.authenticate(UserRole.WAREHOUSE_MANAGER)
        response = self.client.post(
            '/api/purchase-receipts/', self.receipt_payload(order, line), format='json'
        )

        data = self.assert_success_envelope(response, 201)
        self.assertEqual(data['received_by'], self.users[UserRole.WAREHOUSE_MANAGER].pk)
        self.item.refresh_from_db()
        self.assertEqual(self.item.current_stock, Decimal('2'))
        movement = StockMovement.objects.get(reference_id=str(data['id']))
        self.assertEqual(movement.quantity, Decimal('2'))
        self.assertEqual(movement.balance_quantity, Decimal('2'))

    def test_over_receipt_invalid_po_status_and_invalid_line(self):
        order, line = self.create_order(status=PurchaseOrder.Status.ORDERED)
        self.authenticate(UserRole.WAREHOUSE_MANAGER)
        excessive = self.client.post(
            '/api/purchase-receipts/', self.receipt_payload(order, line, 'PR-OVER', '6'), format='json'
        )
        self.assert_error_envelope(excessive, 400)
        self.assertFalse(PurchaseReceipt.objects.exists())
        self.assertFalse(StockMovement.objects.exists())

        draft, draft_line = self.create_order(status=PurchaseOrder.Status.DRAFT)
        invalid_status = self.client.post(
            '/api/purchase-receipts/', self.receipt_payload(draft, draft_line, 'PR-DRAFT'), format='json'
        )
        self.assert_error_envelope(invalid_status, 400)
        invalid_id = self.receipt_payload(order, line, 'PR-BAD-LINE')
        invalid_id['items'][0]['purchase_order_item'] = 999999
        self.assert_error_envelope(self.client.post('/api/purchase-receipts/', invalid_id, format='json'), 400)

    def test_stock_movement_failure_rolls_back_receipt_and_stock(self):
        order, line = self.create_order(status=PurchaseOrder.Status.ORDERED)
        self.authenticate(UserRole.WAREHOUSE_MANAGER)
        with patch('apps.purchasing.services.StockMovement.objects.create', side_effect=IntegrityError('ledger unavailable')):
            response = self.client.post(
                '/api/purchase-receipts/', self.receipt_payload(order, line, 'PR-ROLLBACK'), format='json'
            )

        self.assert_error_envelope(response, 500)
        self.assertFalse(PurchaseReceipt.objects.exists())
        self.assertFalse(StockMovement.objects.exists())
        self.item.refresh_from_db()
        line.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(self.item.current_stock, Decimal('0'))
        self.assertEqual(line.received_quantity, Decimal('0'))
        self.assertEqual(order.status, PurchaseOrder.Status.ORDERED)

    def test_only_warehouse_and_admin_roles_can_receive(self):
        order, line = self.create_order(status=PurchaseOrder.Status.ORDERED)
        for role in (UserRole.PURCHASE_USER, UserRole.PURCHASE_MANAGER, UserRole.ACCOUNTS_USER, UserRole.VIEWER):
            self.authenticate(role)
            denied = self.client.post(
                '/api/purchase-receipts/', self.receipt_payload(order, line, f'PR-DENY-{role}'), format='json'
            )
            self.assert_error_envelope(denied, 403)


class APIResponseAndDocumentationTests(ProcurementAPITestCase):
    def test_success_and_error_response_envelopes(self):
        self.authenticate(UserRole.PURCHASE_USER)
        success = self.client.get('/api/suppliers/')
        self.assert_success_envelope(success, 200)
        error = self.client.post('/api/suppliers/', {'supplier_code': self.supplier.supplier_code, 'name': 'Duplicate'})
        self.assert_error_envelope(error, 400)

    def test_schema_swagger_and_redoc_are_available(self):
        schema = self.client.get('/api/schema/')
        self.assertEqual(schema.status_code, 200)
        schema_data = yaml.safe_load(schema.content)
        self.assertIn('/api/purchase-orders/', schema_data['paths'])
        self.assertIn('/api/invoices/{id}/three-way-match/', schema_data['paths'])
        supplier_create = schema_data['paths']['/api/suppliers/']['post']['responses']['201']
        supplier_schema = supplier_create['content']['application/json']['schema']
        self.assertEqual(supplier_schema['properties']['success']['enum'], [True])
        self.assertIn('data', supplier_schema['properties'])
        supplier_error = schema_data['paths']['/api/suppliers/']['post']['responses']['400']
        error_schema = supplier_error['content']['application/json']['schema']
        self.assertIn('errors', error_schema['properties'])
        self.assertEqual(self.client.get('/api/docs/').status_code, 200)
        self.assertEqual(self.client.get('/api/redoc/').status_code, 200)