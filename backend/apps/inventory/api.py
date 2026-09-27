from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from apps.accounts.permissions import RolePermission
from apps.audit.api import AuditedModelViewSet
from apps.inventory.models import StockMovement, Warehouse
from apps.inventory.serializers import StockMovementSerializer
from apps.purchasing.serializers import WarehouseSerializer


class WarehouseViewSet(AuditedModelViewSet):
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer
    read_roles = {'PURCHASE_MANAGER', 'PURCHASE_USER', 'WAREHOUSE_MANAGER', 'ACCOUNTS_USER', 'VIEWER'}
    write_roles = {'WAREHOUSE_MANAGER'}


class StockMovementViewSet(ReadOnlyModelViewSet):
    queryset = StockMovement.objects.select_related('item', 'warehouse', 'created_by').all()
    serializer_class = StockMovementSerializer
    permission_classes = [RolePermission]
    read_roles = {'PURCHASE_MANAGER', 'WAREHOUSE_MANAGER', 'ACCOUNTS_USER', 'VIEWER'}