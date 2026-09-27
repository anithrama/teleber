from rest_framework.permissions import BasePermission, SAFE_METHODS


class RolePermission(BasePermission):
    message = 'Your role does not have permission to perform this action.'

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser or user.role == 'ADMIN':
            return True

        action = getattr(view, 'action', None)
        role_map = getattr(view, 'role_permissions', {})
        if action in role_map:
            allowed = role_map[action]
        elif request.method in SAFE_METHODS:
            allowed = getattr(view, 'read_roles', set())
        else:
            allowed = getattr(view, 'write_roles', set())
        return user.role in allowed