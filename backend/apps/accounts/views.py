from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.accounts.serializers import RoleTokenObtainPairSerializer, UserSerializer


class LoginView(TokenObtainPairView):
    serializer_class = RoleTokenObtainPairSerializer


class CurrentUserView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user
