import type { ChargerStatus, ConnectorStatus, Prisma } from '@prisma/client';
import { AppError } from '../../common/errors.js';
import { prisma } from '../../common/prisma.js';
import type { AuthPayload } from '../../common/middleware/auth.middleware.js';
import { assertOrgAccess } from '../../common/middleware/auth.middleware.js';
import type { CreateChargerInput } from './chargers.schemas.js';

export type NearbyChargerRow = {
  id: string;
  vendor: string;
  model: string | null;
  lat: number | null;
  lng: number | null;
  status: ChargerStatus;
  address: string | null;
  distance_km: number;
  organization_id: string | null;
};

export class ChargersService {
  async upsertCharger(user: AuthPayload, input: CreateChargerInput): Promise<{ id: string }> {
    if (!user.orgId && user.role !== 'platform_admin') {
      throw new AppError('org_required', 403, 'org_required');
    }
    const organizationId = user.orgId!;

    await prisma.$transaction(async (tx) => {
      await tx.charger.upsert({
        where: { id: input.id },
        create: {
          id: input.id,
          organizationId,
          vendor: input.vendor,
          model: input.model,
          serialNumber: input.serialNumber,
          lat: input.lat,
          lng: input.lng,
          address: input.address,
        },
        update: {
          vendor: input.vendor,
          model: input.model,
          serialNumber: input.serialNumber,
          lat: input.lat,
          lng: input.lng,
          address: input.address,
          organizationId,
        },
      });

      for (const c of input.connectors) {
        await tx.connector.upsert({
          where: {
            chargerId_connectorId: {
              chargerId: input.id,
              connectorId: c.connectorId,
            },
          },
          create: {
            chargerId: input.id,
            connectorId: c.connectorId,
            type: c.type,
            maxKw: c.maxKw,
          },
          update: {
            type: c.type,
            maxKw: c.maxKw,
          },
        });
      }
    });

    return { id: input.id };
  }

  async findNearby(
    lat: number,
    lng: number,
    radiusKm: number,
    orgId?: string,
  ): Promise<NearbyChargerRow[]> {
    if (orgId) {
      return prisma.$queryRaw<NearbyChargerRow[]>`
        SELECT * FROM (
          SELECT id, vendor, model, lat, lng, status, address, organization_id,
            (6371 * acos(cos(radians(${lat})) * cos(radians(lat)) * cos(radians(lng) - radians(${lng}))
            + sin(radians(${lat})) * sin(radians(lat)))) AS distance_km
          FROM chargers
          WHERE lat IS NOT NULL AND lng IS NOT NULL AND organization_id = ${orgId}::uuid
        ) q
        WHERE distance_km <= ${radiusKm}
        ORDER BY distance_km
        LIMIT 50
      `;
    }
    return prisma.$queryRaw<NearbyChargerRow[]>`
      SELECT * FROM (
        SELECT id, vendor, model, lat, lng, status, address, organization_id,
          (6371 * acos(cos(radians(${lat})) * cos(radians(lat)) * cos(radians(lng) - radians(${lng}))
          + sin(radians(${lat})) * sin(radians(lat)))) AS distance_km
        FROM chargers
        WHERE lat IS NOT NULL AND lng IS NOT NULL
      ) q
      WHERE distance_km <= ${radiusKm}
      ORDER BY distance_km
      LIMIT 50
    `;
  }

  async getById(id: string, user?: AuthPayload) {
    const charger = await prisma.charger.findUnique({
      where: { id },
      include: { connectors: true },
    });
    if (!charger) {
      throw new AppError('not_found', 404, 'not_found');
    }
    if (user) {
      assertOrgAccess(user, charger.organizationId);
    }
    return charger;
  }

  async updateStatus(
    chargerId: string,
    status: string,
    connectorId?: number,
    connectorStatus?: string,
  ): Promise<void> {
    const data: Prisma.ChargerUpdateInput = {
      status: status as ChargerStatus,
    };
    await prisma.charger.update({
      where: { id: chargerId },
      data,
    });

    if (connectorId != null && connectorStatus) {
      await prisma.connector.updateMany({
        where: { chargerId, connectorId },
        data: { status: connectorStatus as ConnectorStatus },
      });
    }
  }
}

export const chargersService = new ChargersService();
