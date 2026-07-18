import { TransactionState } from '@prisma/client';
import { AppError } from '../../common/errors.js';
import { prisma } from '../../common/prisma.js';
import { publishChargerCommand } from '../../common/redis.js';
import { walletService } from '../wallet/wallet.service.js';
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

  async startSession(
    user: { sub: string; phone: string },
    input: StartSessionInput,
  ) {
    const existing = await prisma.transaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return {
        transactionId: Number(existing.id),
        state: existing.state,
        idempotent: true as const,
      };
    }

    // TODO(phase-3): tariff estimate + stronger wallet rules
    await walletService.hold(user.sub, 5000, `hold:${input.idempotencyKey}`);

    const created = await prisma.transaction.create({
      data: {
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

  async stopSession(input: StopSessionInput) {
    const tx = await prisma.transaction.findUnique({
      where: { id: BigInt(input.transactionId) },
    });
    if (!tx) {
      throw new AppError('not_found', 404, 'not_found');
    }
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

  async completeFromOcpp(params: {
    ocppTransactionId: number;
    meterStop?: number | null;
  }): Promise<void> {
    const tx = await prisma.transaction.findFirst({
      where: { ocppTransactionId: params.ocppTransactionId },
    });
    if (!tx) return;

    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        meterStop: params.meterStop ?? undefined,
        stoppedAt: new Date(),
      },
    });
    await this.transition(
      tx.id,
      [TransactionState.STOPPING, TransactionState.CHARGING],
      TransactionState.COMPLETED,
    );
    // TODO(phase-3): invoke settleAndInvoice
  }
}

export const sessionsService = new SessionsService();
