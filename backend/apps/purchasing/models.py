from django.db import models

from decimal import Decimal
from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from apps.procurement.models import Item, MaterialRequest, SupplierQuotation
from apps.suppliers.models import Supplier


class PurchaseOrder(models.Model):
	class Status(models.TextChoices):
		DRAFT = 'DRAFT', 'Draft'
		PENDING_APPROVAL = 'PENDING_APPROVAL', 'Pending Approval'
		APPROVED = 'APPROVED', 'Approved'
		REJECTED = 'REJECTED', 'Rejected'
		ORDERED = 'ORDERED', 'Ordered'
		PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED', 'Partially Received'
		RECEIVED = 'RECEIVED', 'Received'
		CANCELLED = 'CANCELLED', 'Cancelled'

	po_number = models.CharField(max_length=40, unique=True)
	supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name='purchase_orders')
	material_request = models.ForeignKey(MaterialRequest, on_delete=models.PROTECT, related_name='purchase_orders')
	quotation = models.ForeignKey(SupplierQuotation, on_delete=models.PROTECT, related_name='purchase_orders', null=True, blank=True)
	order_date = models.DateField()
	expected_delivery_date = models.DateField()
	currency = models.CharField(max_length=3, default='USD')
	status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
	subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
	tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
	discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
	grand_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
	remarks = models.TextField(blank=True)
	created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='created_purchase_orders')
	approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='approved_purchase_orders', null=True, blank=True)
	approved_at = models.DateTimeField(null=True, blank=True)
	rejected_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='rejected_purchase_orders', null=True, blank=True)
	rejected_at = models.DateTimeField(null=True, blank=True)
	rejection_reason = models.TextField(blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ('-order_date', '-id')
		indexes = [models.Index(fields=('status', 'order_date'))]
		constraints = [
			models.CheckConstraint(condition=models.Q(subtotal__gte=0), name='po_subtotal_nonnegative'),
			models.CheckConstraint(condition=models.Q(tax_amount__gte=0), name='po_tax_nonnegative'),
			models.CheckConstraint(condition=models.Q(discount_amount__gte=0), name='po_discount_nonnegative'),
			models.CheckConstraint(condition=models.Q(grand_total__gte=0), name='po_total_nonnegative'),
		]

	def __str__(self) -> str:
		return self.po_number


class PurchaseOrderItem(models.Model):
	purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='items')
	item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='purchase_order_lines')
	quantity = models.DecimalField(max_digits=14, decimal_places=3, validators=[MinValueValidator(Decimal('0.001'))])
	received_quantity = models.DecimalField(max_digits=14, decimal_places=3, default=0)
	rate = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(0)])
	tax_rate = models.DecimalField(max_digits=6, decimal_places=2, validators=[MinValueValidator(0)])
	discount = models.DecimalField(max_digits=14, decimal_places=2, default=0, validators=[MinValueValidator(0)])
	amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)

	class Meta:
		constraints = [
			models.CheckConstraint(condition=models.Q(quantity__gt=0), name='po_item_quantity_positive'),
			models.CheckConstraint(condition=models.Q(received_quantity__gte=0) & models.Q(received_quantity__lte=models.F('quantity')), name='po_item_received_within_quantity'),
			models.CheckConstraint(condition=models.Q(rate__gte=0), name='po_item_rate_nonnegative'),
			models.CheckConstraint(condition=models.Q(tax_rate__gte=0), name='po_item_tax_nonnegative'),
			models.CheckConstraint(condition=models.Q(discount__gte=0), name='po_item_discount_nonnegative'),
		]


class PurchaseReceipt(models.Model):
	class Status(models.TextChoices):
		DRAFT = 'DRAFT', 'Draft'
		SUBMITTED = 'SUBMITTED', 'Submitted'
		CANCELLED = 'CANCELLED', 'Cancelled'

	receipt_number = models.CharField(max_length=40, unique=True)
	purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.PROTECT, related_name='receipts')
	warehouse = models.ForeignKey('inventory.Warehouse', on_delete=models.PROTECT, related_name='receipts')
	receipt_date = models.DateField()
	received_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='purchase_receipts')
	status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ('-receipt_date', '-id')


class PurchaseReceiptItem(models.Model):
	receipt = models.ForeignKey(PurchaseReceipt, on_delete=models.CASCADE, related_name='items')
	purchase_order_item = models.ForeignKey(PurchaseOrderItem, on_delete=models.PROTECT, related_name='receipt_lines')
	ordered_quantity = models.DecimalField(max_digits=14, decimal_places=3)
	received_quantity = models.DecimalField(max_digits=14, decimal_places=3, validators=[MinValueValidator(Decimal('0.001'))])
	rejected_quantity = models.DecimalField(max_digits=14, decimal_places=3, default=0, validators=[MinValueValidator(0)])

	class Meta:
		constraints = [
			models.CheckConstraint(condition=models.Q(received_quantity__gt=0), name='receipt_item_received_positive'),
			models.CheckConstraint(condition=models.Q(rejected_quantity__gte=0) & models.Q(rejected_quantity__lte=models.F('received_quantity')), name='receipt_item_rejected_within_received'),
		]

	@property
	def accepted_quantity(self):
		return self.received_quantity - self.rejected_quantity
