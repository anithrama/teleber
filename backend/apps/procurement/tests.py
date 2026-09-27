from django.test import TestCase

from apps.accounts.models import UserRole
from apps.procurement.models import Item, MaterialRequest
from apps.test_support import ProcurementAPITestCase


class ItemAPITests(ProcurementAPITestCase):
	def setUp(self):
		super().setUp()
		self.authenticate(UserRole.PURCHASE_USER)

	def test_item_create_list_retrieve_update(self):
		create = self.client.post('/api/items/', {
			'item_code': 'ITEM-CRUD', 'name': 'New Item', 'purchase_rate': '15.25', 'tax_rate': '7.5',
		}, format='json')
		self.assert_success_envelope(create, 201)
		item_id = create.json()['data']['id']
		self.assert_success_envelope(self.client.get('/api/items/'), 200)
		self.assert_success_envelope(self.client.get(f'/api/items/{item_id}/'), 200)
		updated = self.client.patch(f'/api/items/{item_id}/', {'name': 'Renamed Item'}, format='json')
		self.assertEqual(self.assert_success_envelope(updated, 200)['name'], 'Renamed Item')

	def test_item_duplicate_negative_financials_and_invalid_types(self):
		duplicate = self.client.post('/api/items/', {
			'item_code': self.item.item_code, 'name': 'Duplicate item',
		}, format='json')
		self.assert_error_envelope(duplicate, 400)
		negative_rate = self.client.post('/api/items/', {
			'item_code': 'ITEM-NEG-RATE', 'name': 'Negative rate', 'purchase_rate': '-1',
		}, format='json')
		self.assert_error_envelope(negative_rate, 400)
		negative_tax = self.client.post('/api/items/', {
			'item_code': 'ITEM-NEG-TAX', 'name': 'Negative tax', 'tax_rate': '-0.1',
		}, format='json')
		self.assert_error_envelope(negative_tax, 400)
		bad_rate = self.client.post('/api/items/', {
			'item_code': 'ITEM-BAD-RATE', 'name': 'Bad rate', 'purchase_rate': 'many',
		}, format='json')
		self.assert_error_envelope(bad_rate, 400)


class MaterialRequestAPITests(ProcurementAPITestCase):
	def setUp(self):
		super().setUp()
		self.authenticate(UserRole.PURCHASE_USER)

	def test_create_submit_and_manager_approve(self):
		created = self.client.post('/api/material-requests/', self.material_request_payload(), format='json')
		data = self.assert_success_envelope(created, 201)
		request_id = data['id']
		self.assertEqual(data['status'], MaterialRequest.Status.DRAFT)

		submitted = self.client.post(f'/api/material-requests/{request_id}/submit/')
		self.assertEqual(self.assert_success_envelope(submitted, 200)['status'], MaterialRequest.Status.SUBMITTED)
		self.authenticate(UserRole.PURCHASE_MANAGER)
		approved = self.client.post(f'/api/material-requests/{request_id}/approve/')
		self.assertEqual(self.assert_success_envelope(approved, 200)['status'], MaterialRequest.Status.APPROVED)

	def test_reject_cancel_and_invalid_transitions(self):
		submitted_request = MaterialRequest.objects.create(
			request_number='MR-REJECT', requested_by=self.users[UserRole.PURCHASE_USER],
			department='Operations', request_date=self.material_request.request_date,
			required_date=self.material_request.required_date, status=MaterialRequest.Status.SUBMITTED,
		)
		self.authenticate(UserRole.PURCHASE_MANAGER)
		missing_reason = self.client.post(f'/api/material-requests/{submitted_request.pk}/reject/', {}, format='json')
		self.assert_error_envelope(missing_reason, 400)
		rejected = self.client.post(
			f'/api/material-requests/{submitted_request.pk}/reject/', {'reason': 'Budget review'}, format='json'
		)
		self.assertEqual(self.assert_success_envelope(rejected, 200)['status'], MaterialRequest.Status.REJECTED)

		canceled = self.client.post(f'/api/material-requests/{self.material_request.pk}/cancel/')
		self.assertEqual(self.assert_success_envelope(canceled, 200)['status'], MaterialRequest.Status.CANCELLED)
		invalid = self.client.post(f'/api/material-requests/{self.material_request.pk}/approve/')
		self.assert_error_envelope(invalid, 400)

	def test_status_cannot_be_set_directly_and_bad_lines_are_rejected(self):
		payload = self.material_request_payload('MR-STATUS')
		payload['status'] = 'APPROVED'
		response = self.client.post('/api/material-requests/', payload, format='json')
		self.assertEqual(self.assert_success_envelope(response, 201)['status'], MaterialRequest.Status.DRAFT)

		bad_quantity = self.material_request_payload('MR-NEGATIVE')
		bad_quantity['items'][0]['quantity'] = '-1'
		self.assert_error_envelope(self.client.post('/api/material-requests/', bad_quantity, format='json'), 400)
		bad_item = self.material_request_payload('MR-BAD-ITEM')
		bad_item['items'][0]['item'] = 999999
		self.assert_error_envelope(self.client.post('/api/material-requests/', bad_item, format='json'), 400)

	def test_non_manager_cannot_approve(self):
		self.authenticate(UserRole.PURCHASE_USER)
		response = self.client.post(f'/api/material-requests/{self.material_request.pk}/approve/')
		self.assert_error_envelope(response, 403)


class SupplierQuotationAPITests(ProcurementAPITestCase):
	def setUp(self):
		super().setUp()
		self.authenticate(UserRole.PURCHASE_USER)

	def test_create_update_retrieve_and_compare_quotations(self):
		first = self.client.post('/api/quotations/', self.quotation_payload('SQ-FIRST'), format='json')
		first_data = self.assert_success_envelope(first, 201)
		self.assertEqual(first_data['total_amount'], '20.00')
		second = self.client.post('/api/quotations/', self.quotation_payload(
			'SQ-SECOND', supplier=self.alternate_supplier, rate='11',
		), format='json')
		self.assert_success_envelope(second, 201)
		updated = self.client.patch(f"/api/quotations/{first_data['id']}/", {'remarks': 'Revised note'}, format='json')
		self.assertEqual(self.assert_success_envelope(updated, 200)['remarks'], 'Revised note')
		self.assert_success_envelope(self.client.get(f"/api/quotations/{first_data['id']}/"), 200)
		compare = self.client.get('/api/quotations/compare/', {'material_request': self.material_request.pk})
		rows = self.assert_success_envelope(compare, 200)
		self.assertEqual(len(rows), 2)
		self.assertEqual({row['supplier'] for row in rows}, {'Test Supplier', 'Alternate Supplier'})
		self.assertTrue(all('grand_total' in row and 'valid_until' in row for row in rows))

	def test_invalid_supplier_item_quantity_and_dates(self):
		bad_supplier = self.quotation_payload('SQ-BAD-SUP')
		bad_supplier['supplier'] = 999999
		self.assert_error_envelope(self.client.post('/api/quotations/', bad_supplier, format='json'), 400)
		bad_item = self.quotation_payload('SQ-BAD-ITEM')
		bad_item['items'][0]['item'] = 999999
		self.assert_error_envelope(self.client.post('/api/quotations/', bad_item, format='json'), 400)
		bad_quantity = self.quotation_payload('SQ-BAD-QTY', quantity='0')
		self.assert_error_envelope(self.client.post('/api/quotations/', bad_quantity, format='json'), 400)
		bad_date = self.quotation_payload('SQ-BAD-DATE')
		bad_date['valid_until'] = '2000-01-01'
		self.assert_error_envelope(self.client.post('/api/quotations/', bad_date, format='json'), 400)
