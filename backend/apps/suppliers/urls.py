from rest_framework.routers import DefaultRouter

from apps.suppliers.api import SupplierViewSet

router = DefaultRouter()
router.register('suppliers', SupplierViewSet, basename='supplier')
urlpatterns = router.urls