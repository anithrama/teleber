from datetime import date, timedelta
from decimal import Decimal

from rest_framework.test import APITestCase, APIClient

from apps.accounts.models import User, UserRole
from apps.accounting.models import PurchaseInvoice, PurchaseInvoiceItem
from apps.inventory.models import Warehouse
from apps.procurement.models import Item, MaterialRequest, MaterialRequestItem
from apps.purchasing.models import PurchaseOrder, PurchaseOrderItem
from apps.suppliers.models import Supplier


class ProcurementAPITestCase(APITestCase):
    def setUp(self):
        self.users = {
            role: User.objects.create_user(
                username=role.lower(),
                password='Test-password-123!',
                role=role,
            )
            for role, _label in UserRole.choices
        }
        self.supplier = Supplier.objects.create(supplier_code='SUP-TEST', name='Test Supplier')
        self.alternate_supplier = Supplier.objects.create(supplier_code='SUP-ALT', name='Alternate Supplier')
        self.item = Item.objects.create(item_code='ITEM-TEST', name='Test Item', purchase_rate=Decimal('10'))
        self.second_item = Item.objects.create(item_code='ITEM-ALT', name='Alternate Item', purchase_rate=Decimal('5'))
        self.warehouse = Warehouse.objects.create(code='WH-TEST', name='Test Warehouse')
        today = date.today()
        self.material_request = MaterialRequest.objects.create(
            request_number='MR-TEST',
            requested_by=self.users[UserRole.PURCHASE_USER],
            department='Operations',
            request_date=today,
            required_date=today + timedelta(days=10),
        )
        self.request_line = MaterialRequestItem.objects.create(
            material_request=self.material_request,
            item=self.item,
            quantity=Decimal('5'),
            estimated_rate=Decimal('10'),
        )

    def authenticate(self, role):
        self.client.force_authenticate(self.users[role])

    def assert_success_envelope(self, response, expected_status=None):
        if expected_status is not None:
            self.assertEqual(response.status_code, expected_status, response.content)
        payload = response.json()
        self.assertEqual(payload.get('success'), True, payload)
        self.assertIn('message', payload)
        self.assertIn('data', payload)
        return payload['data']

    def assert_error_envelope(self, response, expected_status=None):
        if expected_status is not None:
            self.assertEqual(response.status_code, expected_status, response.content)
        payload = response.json()
        self.assertIs(payload.get('success'), False, payload)
        self.assertIn('message', payload)
        self.assertIn('errors', payload)
        return payload

    def material_request_payload(self, number='MR-API'):
        today = date.today()
        return {
            'request_number': number,
            'department': 'Operations',
            'request_date': today.isoformat(),
            'required_date': (today + timedelta(days=5)).isoformat(),
            'priority': 'NORMAL',
            'items': [{'item': self.item.pk, 'quantity': '2', 'estimated_rate': '10'}],
        }

    def quotation_payload(self, number='SQ-API', supplier=None, item=None, quantity='2', rate='10'):
        today = date.today()
        return {
            'quotation_number': number,
            'supplier': (supplier or self.supplier).pk,
            'material_request': self.material_request.pk,
            'quotation_date': today.isoformat(),
            'valid_until': (today + timedelta(days=10)).isoformat(),
            'items': [{
                'item': (item or self.item).pk,
                'quantity': quantity,
                'rate': rate,
                'tax_rate': '0',
            }],
        }

    def purchase_order_payload(self, number='PO-API', **overrides):
        today = date.today()
        payload = {
            'po_number': number,
            'supplier': self.supplier.pk,
            'material_request': self.material_request.pk,
            'order_date': today.isoformat(),
            'expected_delivery_date': (today + timedelta(days=10)).isoformat(),
            'currency': 'USD',
            'items': [{
                'item': self.item.pk,
                'quantity': '2',
                'rate': '10',
                'tax_rate': '0',
                'discount': '0',
            }],
        }
        payload.update(overrides)
        return payload

    def create_order(self, status=PurchaseOrder.Status.PENDING_APPROVAL, creator=None):
        today = date.today()
        order = PurchaseOrder.objects.create(
            po_number=f'PO-{PurchaseOrder.objects.count() + 1}',
            supplier=self.supplier,
            material_request=self.material_request,
            order_date=today,
            expected_delivery_date=today + timedelta(days=5),
            created_by=creator or self.users[UserRole.PURCHASE_USER],
            status=status,
        )
        line = PurchaseOrderItem.objects.create(
            purchase_order=order,
            item=self.item,
            quantity=Decimal('5'),
            rate=Decimal('10'),
            tax_rate=Decimal('0'),
        )
        return order, line

    def create_invoice(self, order, *, quantity='5', rate='10', amount='50', number='INV-TEST'):
        today = date.today()
        total = Decimal(amount)
        invoice = PurchaseInvoice.objects.create(
            invoice_number=number,
            supplier=order.supplier,
            purchase_order=order,
            invoice_date=today,
            due_date=today + timedelta(days=30),
            subtotal=total,
            tax_amount=Decimal('0'),
            grand_total=total,
            outstanding_amount=total,
        )
        PurchaseInvoiceItem.objects.create(
            invoice=invoice,
            item=self.item,
            quantity=Decimal(quantity),
            rate=Decimal(rate),
            tax_rate=Decimal('0'),
            amount=total,
        )
        return invoice

    def new_client(self, role=None):
        client = APIClient()
        if role:
            client.force_authenticate(self.users[role])
        return client