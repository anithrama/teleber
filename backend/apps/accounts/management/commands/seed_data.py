import os
import secrets
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User, UserRole
from apps.accounting.models import PurchaseInvoice, PurchaseInvoiceItem
from apps.inventory.models import Warehouse
from apps.procurement.models import (
    Item,
    MaterialRequest,
    MaterialRequestItem,
    SupplierQuotation,
    SupplierQuotationItem,
)
from apps.purchasing.models import PurchaseOrder, PurchaseOrderItem
from apps.purchasing.services import calculate_purchase_order
from apps.suppliers.models import Supplier


class Command(BaseCommand):
    help = 'Create or update safe sample data for the procurement module.'

    @transaction.atomic
    def handle(self, *args, **options):
        password = os.environ.get('SEED_DEFAULT_PASSWORD') or secrets.token_urlsafe(18)
        roles = (
            ('admin', UserRole.ADMIN),
            ('purchase.manager', UserRole.PURCHASE_MANAGER),
            ('buyer', UserRole.PURCHASE_USER),
            ('warehouse', UserRole.WAREHOUSE_MANAGER),
            ('accounts', UserRole.ACCOUNTS_USER),
            ('viewer', UserRole.VIEWER),
        )
        created_users = []
        users = {}
        for username, role in roles:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={'email': f'{username.replace(".", "_")}@example.test', 'role': role},
            )
            if created:
                user.set_password(password)
                user.save(update_fields=('password',))
                created_users.append(username)
            elif user.role != role:
                user.role = role
                user.save(update_fields=('role',))
            users[username] = user

        supplier, _ = Supplier.objects.update_or_create(
            supplier_code='SUP-001',
            defaults={
                'name': 'Northwind Industrial Supply',
                'email': 'orders@northwind.example',
                'city': 'Seattle',
                'country': 'US',
                'payment_terms': 'Net 30',
                'status': Supplier.Status.ACTIVE,
            },
        )
        item, _ = Item.objects.update_or_create(
            item_code='ITM-001',
            defaults={
                'name': 'Industrial fastener kit',
                'category': 'Maintenance',
                'unit': 'Kit',
                'purchase_rate': Decimal('24.50'),
                'tax_rate': Decimal('8.00'),
                'minimum_stock': Decimal('10'),
                'is_active': True,
            },
        )
        warehouse, _ = Warehouse.objects.update_or_create(
            code='WH-MAIN', defaults={'name': 'Main Warehouse', 'is_active': True}
        )

        today = timezone.localdate()
        material_request, _ = MaterialRequest.objects.update_or_create(
            request_number='MR-2026-001',
            defaults={
                'requested_by': users['buyer'],
                'department': 'Maintenance',
                'request_date': today,
                'required_date': today + timedelta(days=14),
                'priority': MaterialRequest.Priority.NORMAL,
                'status': MaterialRequest.Status.APPROVED,
                'remarks': 'Seed request for API exploration.',
            },
        )
        MaterialRequestItem.objects.update_or_create(
            material_request=material_request,
            item=item,
            defaults={'quantity': Decimal('20'), 'estimated_rate': Decimal('24.50')},
        )

        quotation, _ = SupplierQuotation.objects.update_or_create(
            quotation_number='SQ-2026-001',
            defaults={
                'supplier': supplier,
                'material_request': material_request,
                'quotation_date': today,
                'valid_until': today + timedelta(days=30),
                'status': SupplierQuotation.Status.SUBMITTED,
                'remarks': 'Seed supplier quotation.',
            },
        )
        quotation_line_amount = Decimal('20') * Decimal('24.50') * Decimal('1.08')
        SupplierQuotationItem.objects.update_or_create(
            quotation=quotation,
            item=item,
            defaults={
                'quantity': Decimal('20'),
                'rate': Decimal('24.50'),
                'tax_rate': Decimal('8.00'),
                'amount': quotation_line_amount.quantize(Decimal('0.01')),
            },
        )
        quotation.total_amount = quotation_line_amount.quantize(Decimal('0.01'))
        quotation.save(update_fields=('total_amount',))

        order, _ = PurchaseOrder.objects.update_or_create(
            po_number='PO-2026-001',
            defaults={
                'supplier': supplier,
                'material_request': material_request,
                'quotation': quotation,
                'order_date': today,
                'expected_delivery_date': today + timedelta(days=10),
                'currency': 'USD',
                'status': PurchaseOrder.Status.DRAFT,
                'created_by': users['buyer'],
                'remarks': 'Seed draft order.',
            },
        )
        PurchaseOrderItem.objects.update_or_create(
            purchase_order=order,
            item=item,
            defaults={
                'quantity': Decimal('20'),
                'received_quantity': Decimal('0'),
                'rate': Decimal('24.50'),
                'tax_rate': Decimal('8.00'),
                'discount': Decimal('0'),
            },
        )
        calculate_purchase_order(order)

        self.stdout.write(self.style.SUCCESS('Procurement sample data is ready.'))
        if created_users:
            self.stdout.write(f'Created users: {", ".join(created_users)}')
            self.stdout.write(f'Temporary password for those users: {password}')
            self.stdout.write('Set SEED_DEFAULT_PASSWORD to choose a password before creating seed users.')