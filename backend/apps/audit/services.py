import json

from django.core.serializers.json import DjangoJSONEncoder

from apps.audit.models import AuditLog


def json_safe(data):
    return json.loads(json.dumps(data, cls=DjangoJSONEncoder))


def record_audit(user, action, instance, old_data=None, new_data=None):
    AuditLog.objects.create(
        user=user if getattr(user, 'is_authenticated', False) else None,
        action=action,
        model=instance._meta.label,
        object_id=str(instance.pk),
        old_data=json_safe(old_data or {}),
        new_data=json_safe(new_data or {}),
    )