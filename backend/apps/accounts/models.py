from django.contrib.auth.models import AbstractUser
from django.db import models


class UserRole(models.TextChoices):
    ADMIN = 'ADMIN', 'Admin'
    PURCHASE_MANAGER = 'PURCHASE_MANAGER', 'Purchase Manager'
    PURCHASE_USER = 'PURCHASE_USER', 'Purchase User'
    WAREHOUSE_MANAGER = 'WAREHOUSE_MANAGER', 'Warehouse Manager'
    ACCOUNTS_USER = 'ACCOUNTS_USER', 'Accounts User'
    VIEWER = 'VIEWER', 'Viewer'


class User(AbstractUser):
    role = models.CharField(max_length=32, choices=UserRole.choices, default=UserRole.VIEWER)

    def __str__(self) -> str:
        return self.get_full_name() or self.username
