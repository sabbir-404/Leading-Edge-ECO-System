
import { UserRole, User, UserGroup } from '../types';

export const PERMISSIONS = {
  VIEW_DASHBOARD: 'view_dashboard',
  MANAGE_PRODUCTS: 'manage_products', // Add, Edit
  DELETE_PRODUCTS: 'delete_products', // Delete
  MANAGE_CATEGORIES: 'manage_categories',
  MANAGE_ORDERS: 'manage_orders', // View, Update Status
  MANAGE_USERS: 'manage_users', // Edit roles
  VIEW_USERS: 'view_users',
  MANAGE_CONTENT: 'manage_content', // Pages, Site Config
  MANAGE_PROJECTS: 'manage_projects',
  MANAGE_MARKETING: 'manage_marketing', // Newsletter
  MANAGE_SHIPPING: 'manage_shipping',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Fallback role-based permissions (used when no group is assigned)
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    'view_dashboard', 'manage_products', 'delete_products', 'manage_categories',
    'manage_orders', 'manage_users', 'view_users', 'manage_content',
    'manage_projects', 'manage_marketing', 'manage_shipping'
  ],
  moderator: [
    'view_dashboard', 'manage_products', 'manage_categories', 'manage_content',
    'manage_projects', 'view_users', 'manage_orders'
  ],
  customer_service: [
    'view_dashboard', 'manage_orders', 'view_users'
  ],
  customer: []
};

// Cache for group permissions loaded from the server
let _groupPermissionsCache: Record<string, string[]> = {};

export const setGroupPermissionsCache = (groups: UserGroup[]) => {
  _groupPermissionsCache = {};
  for (const g of groups) {
    _groupPermissionsCache[g.id] = g.permissions || [];
  }
};

export const hasPermission = (user: User | null, permission: Permission): boolean => {
  if (!user) return false;

  // Admin always has full access regardless of group
  if (user.role === 'admin') return true;

  // If user has a group assigned, check group permissions
  if (user.groupId && _groupPermissionsCache[user.groupId]) {
    return _groupPermissionsCache[user.groupId].includes(permission);
  }

  // Fallback to role-based permissions
  const userPermissions = ROLE_PERMISSIONS[user.role] || [];
  return userPermissions.includes(permission);
};

export const canManageRole = (currentUser: User, _targetRole: UserRole): boolean => {
  if (currentUser.role !== 'admin') return false;
  return true;
};
