from rest_framework.routers import DefaultRouter

from apps.accounting.api import PurchaseInvoiceViewSet

router = DefaultRouter()
router.register('invoices', PurchaseInvoiceViewSet, basename='invoice')
urlpatterns = router.urls