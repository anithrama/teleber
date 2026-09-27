from rest_framework.routers import DefaultRouter

from apps.procurement.api import ItemViewSet, MaterialRequestViewSet, SupplierQuotationViewSet

router = DefaultRouter()
router.register('items', ItemViewSet, basename='item')
router.register('material-requests', MaterialRequestViewSet, basename='material-request')
router.register('quotations', SupplierQuotationViewSet, basename='quotation')
urlpatterns = router.urls