from django.db import models

from decimal import Decimal
from django.core.validators import MinValueValidator
from django.db import models

from apps.procurement.models import Item
from apps.purchasing.models import PurchaseOrder
from apps.suppliers.models import Supplier


class PurchaseInvoice(models.Model):
	class Status(models.TextChoices):
		DRAFT = 'DRAFT', 'Draft'
		UNPAID = 'UNPAID', 'Unpaid'
		PARTIALLY_PAID = 'PARTIALLY_PAID', 'Partially Paid'
		PAID = 'PAID', 'Paid'
		MATCHED = 'MATCHED', 'Matched'
		DISPUTED = 'DISPUTED', 'Disputed'

	invoice_number = models.CharField(max_length=50, unique=True)
	supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name='invoices')
	purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.PROTECT, related_name='invoices')
	invoice_date = models.DateField()
	due_date = models.DateField()
	subtotal = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(0)])
	tax_amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(0)])
	grand_total = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(0)])
	paid_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0, validators=[MinValueValidator(0)])
	outstanding_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
	status = models.CharField(max_length=16, choices=Status.choices, default=Status.UNPAID)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ('-invoice_date', '-id')
		constraints = [
			models.CheckConstraint(condition=models.Q(grand_total__gte=0), name='invoice_total_nonnegative'),
			models.CheckConstraint(condition=models.Q(paid_amount__gte=0) & models.Q(paid_amount__lte=models.F('grand_total')), name='invoice_paid_within_total'),
			models.CheckConstraint(condition=models.Q(outstanding_amount__gte=0), name='invoice_outstanding_nonnegative'),
		]


class PurchaseInvoiceItem(models.Model):
	invoice = models.ForeignKey(PurchaseInvoice, on_delete=models.CASCADE, related_name='items')
	item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='invoice_lines')
	quantity = models.DecimalField(max_digits=14, decimal_places=3, validators=[MinValueValidator(Decimal('0.001'))])
	rate = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(0)])
	tax_rate = models.DecimalField(max_digits=6, decimal_places=2, validators=[MinValueValidator(0)])
	amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)

	class Meta:
		constraints = [
			models.CheckConstraint(condition=models.Q(quantity__gt=0), name='invoice_item_quantity_positive'),
			models.CheckConstraint(condition=models.Q(rate__gte=0), name='invoice_item_rate_nonnegative'),
			models.CheckConstraint(condition=models.Q(tax_rate__gte=0), name='invoice_item_tax_nonnegative'),
		]
