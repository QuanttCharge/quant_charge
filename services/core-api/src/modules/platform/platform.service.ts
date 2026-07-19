import { prisma } from '../../common/prisma.js';
import type { CreateSuperAdminsInput } from './platform.schemas.js';

export class PlatformService {
  async createSuperAdmins(input: CreateSuperAdminsInput) {
    const created: Array<{ userId: string; phone: string; platformRole: string }> = [];

    for (const phone of input.phones) {
      const user = await prisma.user.upsert({
        where: { phone },
        create: {
          phone,
          name: input.name ?? 'Super Admin',
          platformRole: 'platform_admin',
          wallet: { create: {} },
        },
        update: {
          platformRole: 'platform_admin',
          ...(input.name ? { name: input.name } : {}),
        },
      });
      created.push({
        userId: user.id,
        phone: user.phone,
        platformRole: 'platform_admin',
      });
    }

    return { superAdmins: created };
  }

  async listSuperAdmins() {
    const users = await prisma.user.findMany({
      where: { platformRole: 'platform_admin' },
      select: {
        id: true,
        phone: true,
        name: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return { superAdmins: users };
  }
}

export const platformService = new PlatformService();
