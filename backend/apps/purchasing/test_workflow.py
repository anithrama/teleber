from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.accounts.models import User, UserRole
from apps.accounting.models import PurchaseInvoice, PurchaseInvoiceItem
from apps.inventory.models import StockMovement, Warehouse
from apps.procurement.models import Item, MaterialRequest
from apps.purchasing.models import PurchaseOrder, PurchaseOrderItem, PurchaseReceipt
from apps.purchasing.services import create_purchase_receipt
from apps.suppliers.models import Supplier


class PurchaseWorkflowTests(TestCase):
    def setUp(self):
        self.buyer = User.objects.create_user(username='buyer', password='test-pass', role=UserRole.PURCHASE_USER)
        self.manager = User.objects.create_user(username='manager', password='test-pass', role=UserRole.PURCHASE_MANAGER)
        self.warehouse_user = User.objects.create_user(username='warehouse', password='test-pass', role=UserRole.WAREHOUSE_MANAGER)
        self.accounts_user = User.objects.create_user(username='accounts', password='test-pass', role=UserRole.ACCOUNTS_USER)
        self.supplier = Supplier.objects.create(supplier_code='SUP-1', name='Supplier')
        self.item = Item.objects.create(item_code='ITEM-1', name='Item', purchase_rate=Decimal('10'))
        self.warehouse = Warehouse.objects.create(code='WH-1', name='Warehouse')
        today = date.today()
        self.material_request = MaterialRequest.objects.create(
            request_number='MR-1', requested_by=self.buyer, department='Operations',
            request_date=today, required_date=today + timedelta(days=3),
            status=MaterialRequest.Status.APPROVED,
        )
        self.order = PurchaseOrder.objects.create(
            po_number='PO-1', supplier=self.supplier, material_request=self.material_request,
            order_date=today, expected_delivery_date=today + timedelta(days=5),
            created_by=self.buyer, status=PurchaseOrder.Status.APPROVED,
        )
        self.order_line = PurchaseOrderItem.objects.create(
            purchase_order=self.order, item=self.item, quantity=Decimal('5'),
            rate=Decimal('10'), tax_rate=Decimal('0'),
        )

    def receipt_data(self, quantity, rejected=Decimal('0')):
        return {
            'receipt_number': 'PR-1',
            'purchase_order': self.order,
            'warehouse': self.warehouse,
            'receipt_date': date.today(),
            'items': [{
                'purchase_order_item': self.order_line,
                'received_quantity': Decimal(quantity),
                'rejected_quantity': Decimal(rejected),
            }],
        }

    def test_purchase_user_cannot_approve_own_order(self):
        self.order.created_by = self.manager
        self.order.status = PurchaseOrder.Status.PENDING_APPROVAL
        self.order.save(update_fields=('created_by', 'status'))
        client = APIClient()
        client.force_authenticate(self.manager)

        response = client.post(reverse('purchase-order-approve', args=[self.order.pk]))

        self.assertEqual(response.status_code, 400)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, PurchaseOrder.Status.PENDING_APPROVAL)

    def test_excess_receipt_rolls_back_without_stock_update(self):
        with self.assertRaises(ValidationError):
            create_purchase_receipt(data=self.receipt_data('6'), user=self.warehouse_user)

        self.assertFalse(PurchaseReceipt.objects.exists())
        self.assertFalse(StockMovement.objects.exists())
        self.item.refresh_from_db()
        self.assertEqual(self.item.current_stock, Decimal('0'))

    def test_valid_receipt_updates_stock_and_purchase_order(self):
        receipt = create_purchase_receipt(
            data=self.receipt_data('4', rejected=Decimal('1')),
            user=self.warehouse_user,
        )

        self.item.refresh_from_db()
        self.order.refresh_from_db()
        self.order_line.refresh_from_db()
        movement = StockMovement.objects.get()
        self.assertEqual(receipt.items.get().accepted_quantity, Decimal('3'))
        self.assertEqual(self.item.current_stock, Decimal('3'))
        self.assertEqual(movement.quantity, Decimal('3'))
        self.assertEqual(movement.balance_quantity, Decimal('3'))
        self.assertEqual(self.order_line.received_quantity, Decimal('3'))
        self.assertEqual(self.order.status, PurchaseOrder.Status.PARTIALLY_RECEIVED)

    def test_receipt_api_creates_inventory_movement(self):
        client = APIClient()
        client.force_authenticate(self.warehouse_user)
        response = client.post(reverse('purchase-receipt-list'), {
            'receipt_number': 'PR-API-1',
            'purchase_order': self.order.pk,
            'warehouse': self.warehouse.pk,
            'receipt_date': date.today().isoformat(),
            'items': [{
                'purchase_order_item': self.order_line.pk,
                'received_quantity': '2',
                'rejected_quantity': '0',
            }],
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(StockMovement.objects.get().quantity, Decimal('2'))
        self.assertEqual(response.data['received_by'], self.warehouse_user.pk)

    def test_purchase_order_api_calculates_totals(self):
        client = APIClient()
        client.force_authenticate(self.buyer)
        response = client.post(reverse('purchase-order-list'), {
            'po_number': 'PO-CALC',
            'supplier': self.supplier.pk,
            'material_request': self.material_request.pk,
            'order_date': date.today().isoformat(),
            'expected_delivery_date': (date.today() + timedelta(days=5)).isoformat(),
            'currency': 'USD',
            'subtotal': '1',
            'tax_amount': '0',
            'grand_total': '1',
            'items': [{
                'item': self.item.pk,
                'quantity': '2',
                'rate': '10',
                'tax_rate': '10',
                'discount': '1',
            }],
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data['subtotal']), Decimal('20.00'))
        self.assertEqual(Decimal(response.data['tax_amount']), Decimal('1.90'))
        self.assertEqual(Decimal(response.data['grand_total']), Decimal('20.90'))

    def test_three_way_match_compares_invoice_to_received_items(self):
        create_purchase_receipt(data=self.receipt_data('3'), user=self.warehouse_user)
        invoice = PurchaseInvoice.objects.create(
            invoice_number='INV-MATCH', supplier=self.supplier, purchase_order=self.order,
            invoice_date=date.today(), due_date=date.today() + timedelta(days=30),
            subtotal=Decimal('30'), tax_amount=Decimal('0'), grand_total=Decimal('30'),
            outstanding_amount=Decimal('30'),
        )
        PurchaseInvoiceItem.objects.create(
            invoice=invoice, item=self.item, quantity=Decimal('3'),
            rate=Decimal('10'), tax_rate=Decimal('0'), amount=Decimal('30'),
        )
        client = APIClient()
        client.force_authenticate(self.accounts_user)

        response = client.post(reverse('invoice-three-way-match', args=[invoice.pk]))

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['result'], 'MATCHED')