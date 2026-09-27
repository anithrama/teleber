from rest_framework.routers import DefaultRouter

from apps.purchasing.api import PurchaseOrderViewSet, PurchaseReceiptViewSet

router = DefaultRouter()
router.register('purchase-orders', PurchaseOrderViewSet, basename='purchase-order')
router.register('purchase-receipts', PurchaseReceiptViewSet, basename='purchase-receipt')
urlpatterns = router.urls