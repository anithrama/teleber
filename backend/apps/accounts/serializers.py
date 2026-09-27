from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.accounts.models import User


class RoleTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user: User):
        token = super().get_token(user)
        token['role'] = user.role
        return token


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'role')