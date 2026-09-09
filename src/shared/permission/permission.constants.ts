export type PermissionAction = 'read' | 'edit' | 'delete';

export interface PermissionGroup {
  resource: string;
  label: string;
  actions: PermissionAction[];
}

// Permission kalitlarining yagona manbai — frontend ham shu ro'yxatni API orqali oladi.
export const PERMISSION_CATALOG: PermissionGroup[] = [
  { resource: 'map', label: 'Xarita', actions: ['read'] },
  { resource: 'history', label: 'Tarix', actions: ['read'] },
  { resource: 'reports', label: 'Hisobotlar', actions: ['read'] },
  {
    resource: 'engine-events',
    label: 'Dvigatel hodisalari',
    actions: ['read'],
  },
  { resource: 'stop-events', label: "To'xtash hodisalari", actions: ['read'] },
  {
    resource: 'vehicles',
    label: 'Mashinalar',
    actions: ['read', 'edit', 'delete'],
  },
  {
    resource: 'drivers',
    label: 'Haydovchilar',
    actions: ['read', 'edit', 'delete'],
  },
  {
    resource: 'devices',
    label: 'Qurilmalar',
    actions: ['read', 'edit', 'delete'],
  },
  { resource: 'settings', label: 'Sozlamalar', actions: ['read', 'edit'] },
  {
    resource: 'users',
    label: 'Foydalanuvchilar',
    actions: ['read', 'edit', 'delete'],
  },
  // Rol yaratilmaydi/o'chirilmaydi — 'delete' yo'q.
  { resource: 'roles', label: 'Rollar', actions: ['read', 'edit'] },
];

export const ALL_PERMISSIONS: string[] = PERMISSION_CATALOG.flatMap((group) =>
  group.actions.map((action) => `${group.resource}:${action}`),
);

// SuperAdmin uchun joker — guard barcha tekshiruvlarni o'tkazib yuboradi.
export const WILDCARD_PERMISSION = '*';

export const isValidPermission = (key: string): boolean =>
  key === WILDCARD_PERMISSION || ALL_PERMISSIONS.includes(key);
