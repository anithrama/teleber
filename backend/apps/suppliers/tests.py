from django.test import TestCase

from apps.test_support import ProcurementAPITestCase
from apps.suppliers.models import Supplier


class SupplierAPITests(ProcurementAPITestCase):
	def setUp(self):
		super().setUp()
		self.authenticate('PURCHASE_USER')

	def test_create_list_retrieve_update_and_delete(self):
		create = self.client.post('/api/suppliers/', {
			'supplier_code': 'SUP-CRUD', 'name': 'CRUD Supplier', 'email': 'crud@example.test',
		}, format='json')
		self.assert_success_envelope(create, 201)
		supplier_id = create.json()['data']['id']

		listing = self.client.get('/api/suppliers/')
		self.assert_success_envelope(listing, 200)
		retrieve = self.client.get(f'/api/suppliers/{supplier_id}/')
		self.assertEqual(self.assert_success_envelope(retrieve, 200)['name'], 'CRUD Supplier')
		update = self.client.patch(f'/api/suppliers/{supplier_id}/', {'name': 'Updated Supplier'}, format='json')
		self.assertEqual(self.assert_success_envelope(update, 200)['name'], 'Updated Supplier')
		delete = self.client.delete(f'/api/suppliers/{supplier_id}/')
		self.assertEqual(delete.status_code, 204)

	def test_duplicate_code_missing_fields_invalid_email_and_bad_id(self):
		duplicate = self.client.post('/api/suppliers/', {
			'supplier_code': self.supplier.supplier_code, 'name': 'Duplicate',
		}, format='json')
		self.assert_error_envelope(duplicate, 400)
		missing = self.client.post('/api/suppliers/', {'supplier_code': 'SUP-MISSING'}, format='json')
		self.assert_error_envelope(missing, 400)
		invalid_email = self.client.post('/api/suppliers/', {
			'supplier_code': 'SUP-BAD-EMAIL', 'name': 'Bad Email', 'email': 'not-an-email',
		}, format='json')
		self.assert_error_envelope(invalid_email, 400)
		invalid_id = self.client.get('/api/suppliers/not-an-id/')
		self.assert_error_envelope(invalid_id, 404)

	def test_unauthenticated_supplier_write_is_rejected(self):
		self.client.force_authenticate(user=None)
		response = self.client.post('/api/suppliers/', {'supplier_code': 'SUP-NOAUTH', 'name': 'No Auth'})
		self.assert_error_envelope(response, 401)
