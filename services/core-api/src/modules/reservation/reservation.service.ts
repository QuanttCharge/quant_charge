import { prisma } from '../../common/prisma.js';
import { publishChargerCommand } from '../../common/redis.js';
import type { ReserveInput } from './reservation.schemas.js';

export class ReservationService {
  async create(user: { sub: string; phone: string }, input: ReserveInput) {
    const expiresAt = new Date(Date.now() + input.expiryMinutes * 60_000);

    const reservation = await prisma.reservation.create({
      data: {
        chargerId: input.chargerId,
        connectorId: input.connectorId,
        userId: user.sub,
        expiresAt,
      },
    });

    const ocppReservationId = Math.abs(
      [...reservation.id].reduce((a, c) => a + c.charCodeAt(0), 0),
    );

    const cmd = await publishChargerCommand({
      type: 'ReserveNow',
      chargerId: input.chargerId,
      payload: {
        connectorId: input.connectorId,
        expiryDate: expiresAt.toISOString(),
        idTag: user.phone.slice(0, 20),
        reservationId: ocppReservationId,
      },
    });

    return {
      reservationId: reservation.id,
      commandId: cmd.commandId,
      expiresAt,
    };
  }
}

export const reservationService = new ReservationService();
