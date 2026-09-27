from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User, UserRole
from apps.suppliers.models import Supplier


class AuthenticationAPITests(APITestCase):
    def setUp(self):
        self.users = {
            role: User.objects.create_user(
                username='jwt-user' if role == UserRole.PURCHASE_USER else role.lower(),
                password='Strong-password-123!',
                role=role,
            )
            for role, _label in UserRole.choices
        }
        self.user = self.users[UserRole.PURCHASE_USER]
        self.supplier = Supplier.objects.create(supplier_code='AUTH-SUP', name='Protected supplier')

    def test_valid_login_returns_jwt_envelope(self):
        response = self.client.post('/api/auth/login/', {
            'username': 'jwt-user', 'password': 'Strong-password-123!',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.json()
        self.assertIs(payload['success'], True)
        self.assertIn('access', payload['data'])
        self.assertIn('refresh', payload['data'])

    def test_invalid_username_and_password_return_401_envelopes(self):
        for credentials in (
            {'username': 'missing-user', 'password': 'Strong-password-123!'},
            {'username': 'jwt-user', 'password': 'wrong-password'},
        ):
            response = self.client.post('/api/auth/login/', credentials, format='json')
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
            self.assertIs(response.json()['success'], False)

    def test_refresh_returns_access_token(self):
        login = self.client.post('/api/auth/login/', {
            'username': 'jwt-user', 'password': 'Strong-password-123!',
        }, format='json')
        refresh = self.client.post('/api/auth/refresh/', {
            'refresh': login.json()['data']['refresh'],
        }, format='json')

        self.assertEqual(refresh.status_code, status.HTTP_200_OK)
        self.assertIs(refresh.json()['success'], True)
        self.assertIn('access', refresh.json()['data'])

    def test_current_user_with_valid_bearer_token(self):
        login = self.client.post('/api/auth/login/', {
            'username': 'jwt-user', 'password': 'Strong-password-123!',
        }, format='json')
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.json()['data']['access']}")

        response = self.client.get('/api/auth/me/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['data']['role'], UserRole.PURCHASE_USER)

    def test_missing_or_invalid_token_cannot_access_protected_endpoint(self):
        for authorization in (None, 'Bearer not-a-valid-token'):
            self.client.credentials(HTTP_AUTHORIZATION=authorization) if authorization else self.client.credentials()
            response = self.client.get('/api/suppliers/')
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
            self.assertIs(response.json()['success'], False)

    def test_role_matrix_allows_and_denies_supplier_writes(self):
        allowed = {UserRole.ADMIN, UserRole.PURCHASE_MANAGER, UserRole.PURCHASE_USER}
        for role, _label in UserRole.choices:
            self.client.force_authenticate(User.objects.get(role=role))
            response = self.client.post('/api/suppliers/', {
                'supplier_code': f'ROLE-{role}', 'name': f'{role} supplier',
            }, format='json')
            expected = status.HTTP_201_CREATED if role in allowed else status.HTTP_403_FORBIDDEN
            self.assertEqual(response.status_code, expected, f'{role}: {response.content!r}')
            self.assertIs(response.json()['success'], role in allowed)

    def test_all_roles_can_read_suppliers(self):
        for role, _label in UserRole.choices:
            self.client.force_authenticate(User.objects.get(role=role))
            response = self.client.get('/api/suppliers/')
            self.assertEqual(response.status_code, status.HTTP_200_OK, role)
            self.assertIs(response.json()['success'], True)
