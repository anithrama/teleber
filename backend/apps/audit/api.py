from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from apps.accounts.permissions import RolePermission
from apps.audit.models import AuditLog
from apps.audit.serializers import AuditLogSerializer


class AuditLogViewSet(ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related('user').all()
    serializer_class = AuditLogSerializer
    permission_classes = [RolePermission]
    read_roles = {'ADMIN'}
from apps.audit.services import json_safe, record_audit


class AuditedModelViewSet(ModelViewSet):
    permission_classes = [RolePermission]

    def snapshot(self, instance):
        return json_safe(self.get_serializer(instance).data)

    def perform_create(self, serializer):
        instance = serializer.save()
        record_audit(self.request.user, 'CREATE', instance, new_data=self.snapshot(instance))

    def perform_update(self, serializer):
        old_data = self.snapshot(serializer.instance)
        instance = serializer.save()
        record_audit(self.request.user, 'UPDATE', instance, old_data=old_data, new_data=self.snapshot(instance))

    def perform_destroy(self, instance):
        old_data = self.snapshot(instance)
        record_audit(self.request.user, 'DELETE', instance, old_data=old_data)
        instance.delete()