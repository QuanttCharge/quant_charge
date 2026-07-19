import { prisma } from './prisma.js';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PLATFORM_ADMIN_PERMISSIONS,
  clampPermissions,
  hasPermission,
  isOrgAuthRole,
  type OrgAuthRole,
  type Permission,
} from './permissions.js';
import type { AuthPayload, AuthRole } from './middleware/auth.middleware.js';

const ORG_ROLES: OrgAuthRole[] = ['org_admin', 'org_operator', 'org_finance', 'driver'];

export async function seedOrgRolePermissions(organizationId: string): Promise<void> {
  await prisma.$transaction(
    ORG_ROLES.map((role) =>
      prisma.organizationRolePermission.upsert({
        where: {
          organizationId_role: { organizationId, role },
        },
        create: {
          organizationId,
          role,
          permissions: [...DEFAULT_ROLE_PERMISSIONS[role]],
        },
        update: {},
      }),
    ),
  );
}

export async function resolvePermissions(payload: AuthPayload): Promise<Permission[]> {
  if (payload.role === 'platform_admin') {
    return [...PLATFORM_ADMIN_PERMISSIONS];
  }
  if (!payload.orgId || !isOrgAuthRole(payload.role)) {
    return [];
  }

  const row = await prisma.organizationRolePermission.findUnique({
    where: {
      organizationId_role: {
        organizationId: payload.orgId,
        role: payload.role,
      },
    },
  });

  if (row) {
    return clampPermissions(payload.role, row.permissions);
  }
  return [...DEFAULT_ROLE_PERMISSIONS[payload.role]];
}

export async function listOrgRolePermissions(organizationId: string) {
  const rows = await prisma.organizationRolePermission.findMany({
    where: { organizationId },
    orderBy: { role: 'asc' },
  });

  const byRole = new Map(rows.map((r) => [r.role, r.permissions]));
  return ORG_ROLES.map((role) => ({
    role,
    permissions: byRole.get(role) ?? [...DEFAULT_ROLE_PERMISSIONS[role]],
    ceiling: [...DEFAULT_ROLE_PERMISSIONS[role]],
  }));
}

export async function updateOrgRolePermissions(
  organizationId: string,
  role: Exclude<AuthRole, 'platform_admin'>,
  permissions: string[],
) {
  if (!isOrgAuthRole(role)) {
    throw new Error('invalid_role');
  }
  const clamped = clampPermissions(role, permissions);
  return prisma.organizationRolePermission.upsert({
    where: { organizationId_role: { organizationId, role } },
    create: { organizationId, role, permissions: clamped },
    update: { permissions: clamped },
  });
}

export { hasPermission };
