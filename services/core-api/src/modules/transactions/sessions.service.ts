import { TransactionState } from '@prisma/client';
import { AppError } from '../../common/errors.js';
import { prisma } from '../../common/prisma.js';
import { publishChargerCommand } from '../../common/redis.js';
import type { AuthPayload } from '../../common/middleware/auth.middleware.js';
import { assertOrgAccess } from '../../common/middleware/auth.middleware.js';
import { walletService } from '../wallet/wallet.service.js';
import { billingService } from '../billing/billing.service.js';
import type { StartSessionInput, StopSessionInput } from './sessions.schemas.js';

/**
 * Transaction state machine:
 * PENDING → AUTHORIZED → CHARGING → STOPPING → COMPLETED | FAILED | CANCELLED
 */
export class SessionsService {
  async transition(
    id: bigint,
    from: TransactionState[],
    to: TransactionState,
  ): Promise<boolean> {
    const result = await prisma.transaction.updateMany({
      where: { id, state: { in: from } },
      data: { state: to },
    });
    return result.count > 0;
  }

  async startSession(user: AuthPayload, input: StartSessionInput) {
    const existing = await prisma.transaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (user.orgId) assertOrgAccess(user, existing.organizationId);
      return {
        transactionId: Number(existing.id),
        state: existing.state,
        idempotent: true as const,
      };
    }

    const charger = await prisma.charger.findUnique({ where: { id: input.chargerId } });
    if (!charger) throw new AppError('charger_not_found', 404, 'charger_not_found');
    assertOrgAccess(user, charger.organizationId);

    const organizationId = charger.organizationId ?? user.orgId;
    if (!organizationId) throw new AppError('org_required', 403, 'org_required');

    await walletService.hold(user.sub, 5000, `hold:${input.idempotencyKey}`);

    const created = await prisma.transaction.create({
      data: {
        organizationId,
        idempotencyKey: input.idempotencyKey,
        chargerId: input.chargerId,
        connectorId: input.connectorId,
        userId: user.sub,
        idTag: input.idTag ?? user.phone,
        state: TransactionState.PENDING,
      },
    });

    const cmd = await publishChargerCommand({
      type: 'RemoteStartTransaction',
      chargerId: input.chargerId,
      payload: {
        connectorId: input.connectorId,
        idTag: input.idTag ?? user.phone.slice(0, 20),
      },
      correlationId: input.idempotencyKey,
    });

    await this.transition(created.id, [TransactionState.PENDING], TransactionState.AUTHORIZED);

    return {
      transactionId: Number(created.id),
      state: TransactionState.AUTHORIZED,
      commandId: cmd.commandId,
      idempotent: false as const,
    };
  }

  async stopSession(user: AuthPayload, input: StopSessionInput) {
    const tx = await prisma.transaction.findUnique({
      where: { id: BigInt(input.transactionId) },
    });
    if (!tx) {
      throw new AppError('not_found', 404, 'not_found');
    }
    assertOrgAccess(user, tx.organizationId);
    if (tx.ocppTransactionId == null) {
      throw new AppError('ocpp_transaction_not_ready', 409, 'ocpp_transaction_not_ready');
    }

    await this.transition(
      tx.id,
      [TransactionState.CHARGING, TransactionState.AUTHORIZED],
      TransactionState.STOPPING,
    );

    const cmd = await publishChargerCommand({
      type: 'RemoteStopTransaction',
      chargerId: tx.chargerId,
      payload: { transactionId: tx.ocppTransactionId },
      correlationId: input.idempotencyKey,
    });

    return {
      transactionId: Number(tx.id),
      state: TransactionState.STOPPING,
      commandId: cmd.commandId,
    };
  }

  async bindStartFromOcpp(params: {
    chargerId: string;
    ocppTransactionId: number;
    meterStart?: number | null;
  }): Promise<void> {
    const pending = await prisma.transaction.findFirst({
      where: { chargerId: params.chargerId, state: TransactionState.AUTHORIZED },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending) return;

    await prisma.transaction.update({
      where: { id: pending.id },
      data: {
        ocppTransactionId: params.ocppTransactionId,
        meterStart: params.meterStart ?? undefined,
        startedAt: new Date(),
        state: TransactionState.CHARGING,
      },
    });
  }

  async applyMeterEnergy(params: {
    chargerId: string;
    transactionId?: number;
    energyKwh?: number;
  }): Promise<void> {
    if (params.energyKwh == null) return;
    const tx =
      params.transactionId != null
        ? await prisma.transaction.findFirst({
            where: { ocppTransactionId: params.transactionId },
          })
        : await prisma.transaction.findFirst({
            where: {
              chargerId: params.chargerId,
              state: TransactionState.CHARGING,
            },
            orderBy: { createdAt: 'desc' },
          });
    if (!tx) return;
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { energyKwh: params.energyKwh },
    });
  }

  async completeFromOcpp(params: {
    ocppTransactionId: number;
    meterStop?: number | null;
  }): Promise<void> {
    const tx = await prisma.transaction.findFirst({
      where: { ocppTransactionId: params.ocppTransactionId },
    });
    if (!tx) return;

    let energyKwh = tx.energyKwh ? Number(tx.energyKwh) : undefined;
    if (params.meterStop != null && tx.meterStart != null) {
      energyKwh = Math.max(0, (params.meterStop - tx.meterStart) / 1000);
    }

    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        meterStop: params.meterStop ?? undefined,
        stoppedAt: new Date(),
        energyKwh: energyKwh ?? undefined,
      },
    });
    await this.transition(
      tx.id,
      [TransactionState.STOPPING, TransactionState.CHARGING],
      TransactionState.COMPLETED,
    );

    try {
      await billingService.settleAndInvoice(tx.id);
    } catch {
      // settle errors logged inside billing; don't break OCPP consume
    }
  }
}

export const sessionsService = new SessionsService();
