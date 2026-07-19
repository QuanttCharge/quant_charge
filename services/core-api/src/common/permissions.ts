import type { OrgRole } from '@prisma/client';

/** Permission catalog used across org RBAC */
export const PERMISSION_CATALOG = [
  'chargers:read',
  'chargers:write',
  'sessions:read',
  'sessions:write',
  'sessions:own',
  'reservations:*',
  'live:*',
  'tariffs:read',
  'tariffs:write',
  'wallet:read',
  'wallet:own',
  'wallet:topup',
  'members:invite',
  'members:manage',
  'invoices:read',
  'payments:read',
  'roles:configure',
  'orgs:*',
] as const;

export type Permission = (typeof PERMISSION_CATALOG)[number];

export type OrgAuthRole = 'org_admin' | 'org_operator' | 'org_finance' | 'driver';

/** Hard ceilings — org_admin cannot grant above these per role */
export const ROLE_CEILINGS: Record<OrgAuthRole, readonly Permission[]> = {
  org_admin: [
    'chargers:read',
    'chargers:write',
    'sessions:read',
    'sessions:write',
    'sessions:own',
    'reservations:*',
    'live:*',
    'tariffs:read',
    'tariffs:write',
    'wallet:read',
    'wallet:own',
    'wallet:topup',
    'members:invite',
    'members:manage',
    'invoices:read',
    'payments:read',
    'roles:configure',
  ],
  org_operator: [
    'chargers:read',
    'sessions:read',
    'sessions:write',
    'reservations:*',
    'live:*',
  ],
  org_finance: ['wallet:read', 'invoices:read', 'payments:read', 'sessions:read'],
  driver: ['sessions:own', 'wallet:own'],
};

/** Defaults seeded on org create (= ceilings for MVP) */
export const DEFAULT_ROLE_PERMISSIONS: Record<OrgAuthRole, readonly Permission[]> = {
  ...ROLE_CEILINGS,
};

export const PLATFORM_ADMIN_PERMISSIONS: readonly Permission[] = [
  'orgs:*',
  'chargers:read',
  'chargers:write',
  'sessions:read',
  'sessions:write',
  'reservations:*',
  'live:*',
  'wallet:read',
  'wallet:topup',
  'members:invite',
  'members:manage',
  'invoices:read',
  'payments:read',
  'roles:configure',
];

export function isOrgAuthRole(role: string): role is OrgAuthRole {
  return role === 'org_admin' || role === 'org_operator' || role === 'org_finance' || role === 'driver';
}

export function toOrgRole(role: string): OrgRole | null {
  if (!isOrgAuthRole(role)) return null;
  return role;
}

export function clampPermissions(role: OrgAuthRole, requested: string[]): Permission[] {
  const ceiling = new Set(ROLE_CEILINGS[role]);
  const catalog = new Set(PERMISSION_CATALOG);
  const out: Permission[] = [];
  for (const p of requested) {
    if (!catalog.has(p as Permission)) continue;
    if (!ceiling.has(p as Permission)) continue;
    if (!out.includes(p as Permission)) out.push(p as Permission);
  }
  return out;
}

export function hasPermission(granted: readonly string[], required: string): boolean {
  if (granted.includes(required)) return true;
  const [ns] = required.split(':');
  if (ns && granted.includes(`${ns}:*`)) return true;
  if (granted.includes('orgs:*') && required.startsWith('orgs')) return true;
  return false;
}
