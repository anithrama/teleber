from django.db import models

from django.db import models


class Supplier(models.Model):
	class Status(models.TextChoices):
		ACTIVE = 'ACTIVE', 'Active'
		INACTIVE = 'INACTIVE', 'Inactive'

	supplier_code = models.CharField(max_length=30, unique=True)
	name = models.CharField(max_length=200)
	email = models.EmailField(blank=True)
	phone = models.CharField(max_length=40, blank=True)
	address = models.TextField(blank=True)
	city = models.CharField(max_length=100, blank=True)
	state = models.CharField(max_length=100, blank=True)
	country = models.CharField(max_length=100, blank=True)
	tax_number = models.CharField(max_length=80, blank=True)
	payment_terms = models.CharField(max_length=200, blank=True)
	status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ('name',)
		indexes = [models.Index(fields=('name', 'status'))]

	def __str__(self) -> str:
		return f'{self.supplier_code} - {self.name}'
