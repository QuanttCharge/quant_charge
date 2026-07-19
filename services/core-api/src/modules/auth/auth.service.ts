import { createHash, randomInt } from 'node:crypto';
import type { OrgRole, PlatformRole } from '@prisma/client';
import { AppError } from '../../common/errors.js';
import { logger } from '../../common/logger.js';
import { config } from '../../common/config.js';
import { prisma } from '../../common/prisma.js';
import {
  signAccessToken,
  type AuthPayload,
  type AuthRole,
} from '../../common/middleware/auth.middleware.js';
import { resolvePermissions } from '../../common/rbac.service.js';
import type { OtpRequestInput, OtpVerifyInput, SelectOrgInput } from './auth.schemas.js';

function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function toAuthRole(platformRole: PlatformRole | null, orgRole?: OrgRole | null): AuthRole {
  if (platformRole === 'platform_admin') return 'platform_admin';
  if (orgRole === 'org_admin') return 'org_admin';
  if (orgRole === 'org_operator') return 'org_operator';
  if (orgRole === 'org_finance') return 'org_finance';
  return 'driver';
}

export class AuthService {
  async requestOtp(input: OtpRequestInput) {
    const code = String(randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + config.OTP_TTL_SECONDS * 1000);

    await prisma.otpChallenge.create({
      data: {
        phone: input.phone,
        codeHash: hashOtp(code),
        expiresAt,
      },
    });

    logger.info(
      { phone: input.phone, code: config.NODE_ENV === 'development' ? code : '******' },
      'OTP issued',
    );

    return {
      ok: true as const,
      expiresIn: config.OTP_TTL_SECONDS,
      ...(config.NODE_ENV === 'development' ? { devCode: code } : {}),
    };
  }

  async verifyOtp(input: OtpVerifyInput) {
    const challenge = await prisma.otpChallenge.findFirst({
      where: {
        phone: input.phone,
        codeHash: hashOtp(input.code),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new AppError('invalid_otp', 401, 'invalid_otp');
    }

    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    let user = await prisma.user.findUnique({
      where: { phone: input.phone },
      include: {
        memberships: {
          where: { status: 'active' },
          include: { organization: true },
        },
      },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone: input.phone,
          wallet: { create: {} },
        },
        include: {
          memberships: {
            where: { status: 'active' },
            include: { organization: true },
          },
        },
      });
    }

    // Auto-accept pending invites for this phone
    const invites = await prisma.organizationInvite.findMany({
      where: {
        phone: input.phone,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    for (const invite of invites) {
      await prisma.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: invite.organizationId,
            userId: user.id,
          },
        },
        create: {
          organizationId: invite.organizationId,
          userId: user.id,
          role: invite.role,
          status: 'active',
          invitedPhone: invite.phone,
        },
        update: { role: invite.role, status: 'active' },
      });
      await prisma.organizationInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
    }

    if (invites.length) {
      user = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        include: {
          memberships: {
            where: { status: 'active' },
            include: { organization: true },
          },
        },
      });
    }

    if (user.platformRole === 'platform_admin') {
      const token = signAccessToken({
        sub: user.id,
        phone: user.phone,
        role: 'platform_admin',
      });
      return {
        token,
        userId: user.id,
        role: 'platform_admin' as AuthRole,
        requiresOrgSelection: false as const,
        memberships: [],
      };
    }

    const memberships = user.memberships.map((m) => ({
      membershipId: m.id,
      organizationId: m.organizationId,
      orgName: m.organization.name,
      orgSlug: m.organization.slug,
      role: toAuthRole(null, m.role),
    }));

    if (memberships.length === 0) {
      // Bare user — no org yet; must wait for invite from super admin / org_admin
      const token = signAccessToken({
        sub: user.id,
        phone: user.phone,
        role: 'driver',
      });
      return {
        token,
        userId: user.id,
        role: 'driver' as AuthRole,
        requiresOrgSelection: false as const,
        memberships: [],
        needsInvite: true as const,
      };
    }

    if (memberships.length === 1) {
      const m = memberships[0]!;
      const token = signAccessToken({
        sub: user.id,
        phone: user.phone,
        role: m.role,
        orgId: m.organizationId,
        membershipId: m.membershipId,
      });
      return {
        token,
        userId: user.id,
        role: m.role,
        orgId: m.organizationId,
        requiresOrgSelection: false as const,
        memberships,
      };
    }

    return {
      token: null,
      userId: user.id,
      role: null,
      requiresOrgSelection: true as const,
      memberships,
      selectOrgToken: signAccessToken({
        sub: user.id,
        phone: user.phone,
        role: 'driver',
      }),
    };
  }

  async selectOrg(userId: string, input: SelectOrgInput) {
    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId,
        organizationId: input.organizationId,
        status: 'active',
      },
      include: { organization: true, user: true },
    });
    if (!membership) {
      throw new AppError('membership_not_found', 404, 'membership_not_found');
    }
    if (membership.user.platformRole === 'platform_admin') {
      throw new AppError('platform_admin_no_org', 400, 'platform_admin_no_org');
    }

    const role = toAuthRole(null, membership.role);
    const token = signAccessToken({
      sub: userId,
      phone: membership.user.phone,
      role,
      orgId: membership.organizationId,
      membershipId: membership.id,
    });

    return {
      token,
      userId,
      role,
      orgId: membership.organizationId,
      orgName: membership.organization.name,
    };
  }

  async me(payload: AuthPayload) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: payload.sub },
      include: {
        memberships: {
          where: { status: 'active' },
          include: { organization: true },
        },
      },
    });

    const activeOrg = payload.orgId
      ? user.memberships.find((m) => m.organizationId === payload.orgId)?.organization
      : null;

    return {
      userId: user.id,
      phone: user.phone,
      name: user.name,
      role: payload.role,
      orgId: payload.orgId ?? null,
      organization: activeOrg
        ? { id: activeOrg.id, name: activeOrg.name, slug: activeOrg.slug, status: activeOrg.status }
        : null,
      memberships: user.memberships.map((m) => ({
        membershipId: m.id,
        organizationId: m.organizationId,
        orgName: m.organization.name,
        role: toAuthRole(user.platformRole, m.role),
      })),
      permissions: await resolvePermissions(payload),
    };
  }

  logout() {
    return { ok: true as const };
  }
}

export const authService = new AuthService();
