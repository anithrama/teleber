from django.db import models

from decimal import Decimal
from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from apps.suppliers.models import Supplier


class Item(models.Model):
	item_code = models.CharField(max_length=40, unique=True)
	name = models.CharField(max_length=200)
	description = models.TextField(blank=True)
	category = models.CharField(max_length=100, blank=True)
	unit = models.CharField(max_length=30, default='Each')
	purchase_rate = models.DecimalField(max_digits=14, decimal_places=2, default=0, validators=[MinValueValidator(0)])
	tax_rate = models.DecimalField(max_digits=6, decimal_places=2, default=0, validators=[MinValueValidator(0)])
	minimum_stock = models.DecimalField(max_digits=14, decimal_places=3, default=0, validators=[MinValueValidator(0)])
	current_stock = models.DecimalField(max_digits=14, decimal_places=3, default=0, validators=[MinValueValidator(0)])
	is_active = models.BooleanField(default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ('item_code',)
		constraints = [
			models.CheckConstraint(condition=models.Q(purchase_rate__gte=0), name='item_purchase_rate_nonnegative'),
			models.CheckConstraint(condition=models.Q(tax_rate__gte=0), name='item_tax_rate_nonnegative'),
			models.CheckConstraint(condition=models.Q(minimum_stock__gte=0), name='item_min_stock_nonnegative'),
			models.CheckConstraint(condition=models.Q(current_stock__gte=0), name='item_current_stock_nonnegative'),
		]

	def __str__(self) -> str:
		return f'{self.item_code} - {self.name}'


class MaterialRequest(models.Model):
	class Priority(models.TextChoices):
		LOW = 'LOW', 'Low'
		NORMAL = 'NORMAL', 'Normal'
		HIGH = 'HIGH', 'High'
		URGENT = 'URGENT', 'Urgent'

	class Status(models.TextChoices):
		DRAFT = 'DRAFT', 'Draft'
		SUBMITTED = 'SUBMITTED', 'Submitted'
		APPROVED = 'APPROVED', 'Approved'
		REJECTED = 'REJECTED', 'Rejected'
		CANCELLED = 'CANCELLED', 'Cancelled'

	request_number = models.CharField(max_length=40, unique=True)
	requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='material_requests')
	department = models.CharField(max_length=100)
	request_date = models.DateField()
	required_date = models.DateField()
	priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.NORMAL)
	status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
	remarks = models.TextField(blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ('-request_date', '-id')
		indexes = [models.Index(fields=('status', 'required_date'))]

	def __str__(self) -> str:
		return self.request_number


class MaterialRequestItem(models.Model):
	material_request = models.ForeignKey(MaterialRequest, on_delete=models.CASCADE, related_name='items')
	item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='material_request_lines')
	quantity = models.DecimalField(max_digits=14, decimal_places=3, validators=[MinValueValidator(Decimal('0.001'))])
	estimated_rate = models.DecimalField(max_digits=14, decimal_places=2, default=0, validators=[MinValueValidator(0)])
	remarks = models.CharField(max_length=500, blank=True)

	class Meta:
		constraints = [models.CheckConstraint(condition=models.Q(quantity__gt=0), name='mr_item_quantity_positive')]


class SupplierQuotation(models.Model):
	class Status(models.TextChoices):
		DRAFT = 'DRAFT', 'Draft'
		SUBMITTED = 'SUBMITTED', 'Submitted'
		ACCEPTED = 'ACCEPTED', 'Accepted'
		REJECTED = 'REJECTED', 'Rejected'
		EXPIRED = 'EXPIRED', 'Expired'

	quotation_number = models.CharField(max_length=40, unique=True)
	supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name='quotations')
	material_request = models.ForeignKey(MaterialRequest, on_delete=models.PROTECT, related_name='quotations')
	quotation_date = models.DateField()
	valid_until = models.DateField()
	status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
	remarks = models.TextField(blank=True)
	total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ('-quotation_date', '-id')
		indexes = [models.Index(fields=('material_request', 'status'))]

	def __str__(self) -> str:
		return self.quotation_number


class SupplierQuotationItem(models.Model):
	quotation = models.ForeignKey(SupplierQuotation, on_delete=models.CASCADE, related_name='items')
	item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='quotation_lines')
	quantity = models.DecimalField(max_digits=14, decimal_places=3, validators=[MinValueValidator(Decimal('0.001'))])
	rate = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(0)])
	tax_rate = models.DecimalField(max_digits=6, decimal_places=2, validators=[MinValueValidator(0)])
	amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)

	class Meta:
		constraints = [
			models.CheckConstraint(condition=models.Q(quantity__gt=0), name='quotation_item_quantity_positive'),
			models.CheckConstraint(condition=models.Q(rate__gte=0), name='quotation_item_rate_nonnegative'),
			models.CheckConstraint(condition=models.Q(tax_rate__gte=0), name='quotation_item_tax_nonnegative'),
		]
