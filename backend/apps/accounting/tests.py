from django.test import TestCase

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.db import IntegrityError
from django.urls import reverse
from rest_framework import status

from apps.accounts.models import UserRole
from apps.accounting.models import PurchaseInvoice, PurchaseInvoiceItem
from apps.audit.models import AuditLog
from apps.purchasing.models import PurchaseOrder, PurchaseReceipt
from apps.purchasing.services import create_purchase_receipt
from apps.test_support import ProcurementAPITestCase


class PurchaseInvoiceAPITests(ProcurementAPITestCase):
	def invoice_payload(
		self, number='INV-API', *, supplier=None, order=None,
		quantity='5', rate='10', tax_rate='0', amount='50',
	):
		today = date.today()
		return {
			'invoice_number': number,
			'supplier': (supplier or self.supplier).pk,
			'purchase_order': (order.pk if order else self.create_order(status=PurchaseOrder.Status.ORDERED)[0].pk),
			'invoice_date': today.isoformat(),
			'due_date': (today + timedelta(days=30)).isoformat(),
			'subtotal': '1',
			'tax_amount': '0',
			'grand_total': '1',
			'items': [{
				'item': self.item.pk,
				'quantity': quantity,
				'rate': rate,
				'tax_rate': tax_rate,
				'amount': amount,
			}],
		}

	def receipt_for(self, order, line, quantity='5'):
		return create_purchase_receipt(data={
			'receipt_number': f'PR-{order.pk}',
			'purchase_order': order,
			'warehouse': self.warehouse,
			'receipt_date': date.today(),
			'items': [{
				'purchase_order_item': line,
				'received_quantity': Decimal(quantity),
				'rejected_quantity': Decimal('0'),
			}],
		}, user=self.users[UserRole.WAREHOUSE_MANAGER])

	def setUp(self):
		super().setUp()
		self.authenticate(UserRole.ACCOUNTS_USER)

	def test_invoice_create_list_retrieve_update_and_delete(self):
		order, _line = self.create_order(status=PurchaseOrder.Status.ORDERED)
		payload = self.invoice_payload('INV-CRUD', order=order)
		created = self.client.post('/api/invoices/', payload, format='json')
		data = self.assert_success_envelope(created, 201)
		self.assertEqual(Decimal(data['subtotal']), Decimal('50.00'))
		self.assertEqual(Decimal(data['grand_total']), Decimal('50.00'))
		self.assertEqual(Decimal(data['outstanding_amount']), Decimal('50.00'))
		invoice_id = data['id']
		self.assert_success_envelope(self.client.get('/api/invoices/'), 200)
		self.assert_success_envelope(self.client.get(f'/api/invoices/{invoice_id}/'), 200)
		due_date = (date.today() + timedelta(days=45)).isoformat()
		updated = self.client.patch(f'/api/invoices/{invoice_id}/', {'due_date': due_date}, format='json')
		self.assertEqual(self.assert_success_envelope(updated, 200)['due_date'], due_date)
		deleted = self.client.delete(f'/api/invoices/{invoice_id}/')
		self.assertEqual(deleted.status_code, 204)

	def test_invoice_validation_and_backend_ignores_submitted_totals(self):
		order, _line = self.create_order(status=PurchaseOrder.Status.ORDERED)
		forged = self.invoice_payload('INV-FORGED', order=order, amount='50')
		created = self.client.post('/api/invoices/', forged, format='json')
		self.assertEqual(Decimal(self.assert_success_envelope(created, 201)['grand_total']), Decimal('50.00'))

		duplicate = self.client.post('/api/invoices/', forged, format='json')
		self.assert_error_envelope(duplicate, 400)
		bad_supplier = self.invoice_payload('INV-BAD-SUP', supplier=self.alternate_supplier, order=order)
		self.assert_error_envelope(self.client.post('/api/invoices/', bad_supplier, format='json'), 400)
		bad_order = self.invoice_payload('INV-BAD-PO')
		bad_order['purchase_order'] = 999999
		self.assert_error_envelope(self.client.post('/api/invoices/', bad_order, format='json'), 400)
		negative_quantity = self.invoice_payload('INV-BAD-QTY', order=order, quantity='-1')
		self.assert_error_envelope(self.client.post('/api/invoices/', negative_quantity, format='json'), 400)
		negative_rate = self.invoice_payload('INV-BAD-RATE', order=order, rate='-1')
		self.assert_error_envelope(self.client.post('/api/invoices/', negative_rate, format='json'), 400)
		untrusted_amount = self.invoice_payload('INV-UNTRUSTED-AMOUNT', order=order, amount='not-money')
		recalculated = self.client.post('/api/invoices/', untrusted_amount, format='json')
		self.assertEqual(Decimal(self.assert_success_envelope(recalculated, 201)['grand_total']), Decimal('50.00'))
		invalid_date = self.invoice_payload('INV-BAD-DATE', order=order)
		invalid_date['due_date'] = '2000-01-01'
		self.assert_error_envelope(self.client.post('/api/invoices/', invalid_date, format='json'), 400)

	def test_three_way_match_matched_and_all_mismatch_results(self):
		order, line = self.create_order(status=PurchaseOrder.Status.ORDERED)
		self.receipt_for(order, line)
		cases = (
			('INV-MATCHED', '5', '10', '0', '50', 'MATCHED'),
			('INV-QTY', '4', '10', '0', '40', 'QUANTITY_MISMATCH'),
			('INV-RATE', '5', '9', '0', '45', 'RATE_MISMATCH'),
			('INV-TOTAL', '5', '10', '1', '50', 'TOTAL_MISMATCH'),
		)
		for number, quantity, rate, tax_rate, amount, expected in cases:
			payload = self.invoice_payload(
				number, order=order, quantity=quantity, rate=rate, tax_rate=tax_rate, amount=amount
			)
			created = self.client.post('/api/invoices/', payload, format='json')
			invoice_id = self.assert_success_envelope(created, 201)['id']
			matched = self.client.post(reverse('invoice-three-way-match', args=[invoice_id]))
			self.assertEqual(self.assert_success_envelope(matched, 200)['result'], expected)

	def test_three_way_match_reports_item_mismatch(self):
		order, line = self.create_order(status=PurchaseOrder.Status.ORDERED)
		self.receipt_for(order, line)
		invoice = PurchaseInvoice.objects.create(
			invoice_number='INV-ITEM-MISMATCH', supplier=self.supplier, purchase_order=order,
			invoice_date=date.today(), due_date=date.today() + timedelta(days=30),
			subtotal=Decimal('25'), tax_amount=Decimal('0'), grand_total=Decimal('25'),
			outstanding_amount=Decimal('25'),
		)
		PurchaseInvoiceItem.objects.create(
			invoice=invoice, item=self.second_item, quantity=Decimal('5'),
			rate=Decimal('5'), tax_rate=Decimal('0'), amount=Decimal('25'),
		)
		result = self.client.post(reverse('invoice-three-way-match', args=[invoice.pk]))
		self.assertEqual(self.assert_success_envelope(result, 200)['result'], 'ITEM_MISMATCH')

	def test_failed_invoice_creation_rolls_back_invoice_and_items(self):
		order, _line = self.create_order(status=PurchaseOrder.Status.ORDERED)
		payload = self.invoice_payload('INV-ROLLBACK', order=order)
		with patch('apps.accounting.serializers.PurchaseInvoiceItem.objects.bulk_create', side_effect=IntegrityError('line storage unavailable')):
			response = self.client.post('/api/invoices/', payload, format='json')

		self.assert_error_envelope(response, 500)
		self.assertFalse(PurchaseInvoice.objects.filter(invoice_number='INV-ROLLBACK').exists())
		self.assertFalse(PurchaseInvoiceItem.objects.filter(invoice__invoice_number='INV-ROLLBACK').exists())

	def test_failed_three_way_match_rolls_back_invoice_status_and_audit(self):
		order, line = self.create_order(status=PurchaseOrder.Status.ORDERED)
		self.receipt_for(order, line)
		invoice = self.create_invoice(order, number='INV-MATCH-ROLLBACK')
		audit_count = AuditLog.objects.count()
		with patch('apps.accounting.services.three_way_match', side_effect=RuntimeError('matcher unavailable')):
			response = self.client.post(reverse('invoice-three-way-match', args=[invoice.pk]))

		self.assert_error_envelope(response, 500)
		invoice.refresh_from_db()
		self.assertEqual(invoice.status, PurchaseInvoice.Status.UNPAID)
		self.assertEqual(AuditLog.objects.count(), audit_count)

	def test_payment_validation_and_success(self):
		order, _line = self.create_order(status=PurchaseOrder.Status.ORDERED)
		invoice = self.create_invoice(order, number='INV-PAYMENT')
		invalid = self.client.post(reverse('invoice-payment', args=[invoice.pk]), {'amount': '60'}, format='json')
		self.assert_error_envelope(invalid, 400)
		invoice.refresh_from_db()
		self.assertEqual(invoice.paid_amount, Decimal('0'))
		paid = self.client.post(reverse('invoice-payment', args=[invoice.pk]), {'amount': '20'}, format='json')
		self.assertEqual(Decimal(self.assert_success_envelope(paid, 200)['outstanding_amount']), Decimal('30.00'))

	def test_invoice_create_is_denied_for_non_accounts_roles(self):
		order, _line = self.create_order(status=PurchaseOrder.Status.ORDERED)
		payload = self.invoice_payload('INV-ROLE', order=order)
		for role in (UserRole.PURCHASE_USER, UserRole.WAREHOUSE_MANAGER):
			self.authenticate(role)
			self.assert_error_envelope(self.client.post('/api/invoices/', payload, format='json'), 403)
