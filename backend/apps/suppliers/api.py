from apps.audit.api import AuditedModelViewSet
from apps.suppliers.models import Supplier
from apps.suppliers.serializers import SupplierSerializer


class SupplierViewSet(AuditedModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    read_roles = {'PURCHASE_MANAGER', 'PURCHASE_USER', 'WAREHOUSE_MANAGER', 'ACCOUNTS_USER', 'VIEWER'}
    write_roles = {'PURCHASE_MANAGER', 'PURCHASE_USER'}