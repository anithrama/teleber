from rest_framework.routers import DefaultRouter

from apps.inventory.api import StockMovementViewSet, WarehouseViewSet

router = DefaultRouter()
router.register('warehouses', WarehouseViewSet, basename='warehouse')
router.register('stock-movements', StockMovementViewSet, basename='stock-movement')
urlpatterns = router.urls