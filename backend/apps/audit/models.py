from django.db import models

from django.conf import settings
from django.db import models


class AuditLog(models.Model):
	class Action(models.TextChoices):
		CREATE = 'CREATE', 'Create'
		UPDATE = 'UPDATE', 'Update'
		DELETE = 'DELETE', 'Delete'
		APPROVE = 'APPROVE', 'Approve'
		REJECT = 'REJECT', 'Reject'
		SUBMIT = 'SUBMIT', 'Submit'
		CANCEL = 'CANCEL', 'Cancel'
		RECEIPT = 'RECEIPT', 'Receipt'
		PAYMENT = 'PAYMENT', 'Payment'

	user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
	action = models.CharField(max_length=10, choices=Action.choices)
	model = models.CharField(max_length=120)
	object_id = models.CharField(max_length=40)
	old_data = models.JSONField(default=dict, blank=True)
	new_data = models.JSONField(default=dict, blank=True)
	timestamp = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ('-timestamp',)
		indexes = [models.Index(fields=('model', 'object_id', 'timestamp'))]
