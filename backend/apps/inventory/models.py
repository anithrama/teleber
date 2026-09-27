from django.db import models

from django.conf import settings
from django.db import models

from apps.procurement.models import Item


class Warehouse(models.Model):
	code = models.CharField(max_length=30, unique=True)
	name = models.CharField(max_length=120)
	address = models.TextField(blank=True)
	is_active = models.BooleanField(default=True)

	class Meta:
		ordering = ('name',)

	def __str__(self) -> str:
		return f'{self.code} - {self.name}'


class StockMovement(models.Model):
	class TransactionType(models.TextChoices):
		PURCHASE_RECEIPT = 'PURCHASE_RECEIPT', 'Purchase Receipt'
		ADJUSTMENT = 'ADJUSTMENT', 'Adjustment'

	item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='stock_movements')
	warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name='stock_movements')
	transaction_type = models.CharField(max_length=24, choices=TransactionType.choices)
	reference_type = models.CharField(max_length=40)
	reference_id = models.CharField(max_length=40)
	quantity = models.DecimalField(max_digits=14, decimal_places=3)
	balance_quantity = models.DecimalField(max_digits=14, decimal_places=3)
	transaction_date = models.DateTimeField()
	created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='stock_movements')

	class Meta:
		ordering = ('-transaction_date', '-id')
		indexes = [models.Index(fields=('item', 'warehouse', 'transaction_date'))]
		constraints = [models.CheckConstraint(condition=models.Q(quantity__gt=0), name='stock_movement_quantity_positive')]
