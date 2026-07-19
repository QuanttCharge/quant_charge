import { randomBytes } from 'node:crypto';
import { AppError } from '../../common/errors.js';
import { logger } from '../../common/logger.js';
import { prisma } from '../../common/prisma.js';
import {
  listOrgRolePermissions,
  seedOrgRolePermissions,
  updateOrgRolePermissions,
} from '../../common/rbac.service.js';
import {
  signAccessToken,
  type AuthPayload,
  type AuthRole,
} from '../../common/middleware/auth.middleware.js';
import type {
  AcceptInviteInput,
  CreateOrgInput,
  InviteMemberInput,
  UpdateRolePermissionsInput,
} from './orgs.schemas.js';

function membershipToAuthRole(role: string): AuthRole {
  if (role === 'org_admin') return 'org_admin';
  if (role === 'org_operator') return 'org_operator';
  if (role === 'org_finance') return 'org_finance';
  return 'driver';
}

export class OrgsService {
  /** Platform super-admin creates tenant + invites first org_admin */
  async createByPlatform(user: AuthPayload, input: CreateOrgInput) {
    if (user.role !== 'platform_admin') {
      throw new AppError('forbidden', 403, 'forbidden');
    }
    const existing = await prisma.organization.findUnique({ where: { slug: input.slug } });
    if (existing) throw new AppError('slug_taken', 409, 'slug_taken');

    const org = await prisma.organization.create({
      data: {
        name: input.name,
        slug: input.slug,
        gstin: input.gstin,
      },
    });

    await prisma.tariff.create({
      data: {
        organizationId: org.id,
        name: 'Default',
        ratePerKwhPaise: 1200,
        ratePerMinPaise: 50,
        gstPct: 18,
      },
    });

    await seedOrgRolePermissions(org.id);

    const invite = await this.invite(user, org.id, {
      phone: input.ownerPhone,
      role: 'org_admin',
    });

    return { organization: org, invite };
  }

  async listForUser(user: AuthPayload) {
    if (user.role === 'platform_admin') {
      return prisma.organization.findMany({ orderBy: { createdAt: 'desc' } });
    }
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: user.sub, status: 'active' },
      include: { organization: true },
    });
    return memberships.map((m) => m.organization);
  }

  async invite(user: AuthPayload, orgId: string, input: InviteMemberInput) {
    if (user.role === 'platform_admin') {
      if (input.role !== 'org_admin') {
        throw new AppError(
          'platform_invite_org_admin_only',
          403,
          'platform_admin may only invite org_admin',
        );
      }
    } else if (user.role === 'org_admin') {
      if (user.orgId !== orgId) {
        throw new AppError('forbidden', 403, 'forbidden');
      }
      const allowed = ['org_admin', 'org_operator', 'org_finance', 'driver'] as const;
      if (!allowed.includes(input.role)) {
        throw new AppError('invalid_role', 400, 'invalid_role');
      }
    } else {
      throw new AppError('forbidden', 403, 'forbidden');
    }

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new AppError('org_not_found', 404, 'org_not_found');

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await prisma.organizationInvite.upsert({
      where: {
        organizationId_phone: { organizationId: orgId, phone: input.phone },
      },
      create: {
        organizationId: orgId,
        phone: input.phone,
        role: input.role,
        invitedBy: user.sub,
        token,
        expiresAt,
      },
      update: {
        role: input.role,
        token,
        expiresAt,
        acceptedAt: null,
        invitedBy: user.sub,
      },
    });

    logger.info(
      { orgId, phone: input.phone, role: input.role, token: invite.token },
      'org invite created',
    );

    return {
      inviteId: invite.id,
      phone: invite.phone,
      role: invite.role,
      expiresAt: invite.expiresAt,
      ...(process.env.NODE_ENV === 'development' ? { devToken: invite.token } : {}),
    };
  }

  async acceptInvite(user: AuthPayload, input: AcceptInviteInput) {
    const invite = await prisma.organizationInvite.findUnique({
      where: { token: input.token },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new AppError('invalid_invite', 400, 'invalid_invite');
    }
    if (invite.phone !== user.phone) {
      throw new AppError('invite_phone_mismatch', 403, 'invite_phone_mismatch');
    }

    const membership = await prisma.$transaction(async (tx) => {
      const m = await tx.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: invite.organizationId,
            userId: user.sub,
          },
        },
        create: {
          organizationId: invite.organizationId,
          userId: user.sub,
          role: invite.role,
          status: 'active',
          invitedPhone: invite.phone,
        },
        update: { role: invite.role, status: 'active' },
      });
      await tx.organizationInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      return m;
    });

    const role = membershipToAuthRole(membership.role);
    const token = signAccessToken({
      sub: user.sub,
      phone: user.phone,
      role,
      orgId: membership.organizationId,
      membershipId: membership.id,
    });

    return { token, role, orgId: membership.organizationId };
  }

  async getRolePermissions(user: AuthPayload, orgId: string) {
    this.assertCanConfigureRoles(user, orgId);
    return listOrgRolePermissions(orgId);
  }

  async putRolePermissions(user: AuthPayload, orgId: string, input: UpdateRolePermissionsInput) {
    this.assertCanConfigureRoles(user, orgId);
    const updated = await updateOrgRolePermissions(orgId, input.role, input.permissions);
    return {
      role: updated.role,
      permissions: updated.permissions,
    };
  }

  private assertCanConfigureRoles(user: AuthPayload, orgId: string): void {
    if (user.role === 'platform_admin') return;
    if (user.role === 'org_admin' && user.orgId === orgId) return;
    throw new AppError('forbidden', 403, 'forbidden');
  }
}

export const orgsService = new OrgsService();
