from rest_framework import serializers

from apps.inventory.models import StockMovement


class StockMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockMovement
        fields = '__all__'