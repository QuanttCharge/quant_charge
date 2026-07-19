import { TransactionState } from '@prisma/client';
import { AppError } from '../../common/errors.js';
import { logger } from '../../common/logger.js';
import { prisma } from '../../common/prisma.js';
import { computeSessionCharge, type Tariff as TariffCalc } from '../tariff/tariff.engine.js';
import { walletService } from '../wallet/wallet.service.js';

/**
 * GST invoice generation — loads org tariff; captures wallet hold.
 */
export class BillingService {
  async settleAndInvoice(transactionId: number | bigint): Promise<{ invoiceNo: string }> {
    const id = typeof transactionId === 'bigint' ? transactionId : BigInt(transactionId);
    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: {
        charger: { include: { tariff: true } },
      },
    });
    if (!tx?.userId) {
      throw new AppError('transaction_missing', 404, 'transaction_missing');
    }

    const dbTariff = tx.charger.tariff
      ? tx.charger.tariff
      : tx.organizationId
        ? await prisma.tariff.findFirst({
            where: { organizationId: tx.organizationId, isActive: true },
            orderBy: { createdAt: 'asc' },
          })
        : null;

    const tariff: TariffCalc = {
      ratePerKwhPaise: dbTariff?.ratePerKwhPaise ?? 1200,
      ratePerMinPaise: dbTariff?.ratePerMinPaise ?? 50,
      slabs: Array.isArray(dbTariff?.slabs) ? (dbTariff!.slabs as TariffCalc['slabs']) : [],
      gstPct: dbTariff ? Number(dbTariff.gstPct) : 18,
    };

    const energyKwh = Number(tx.energyKwh ?? 0);
    const durationMin =
      tx.startedAt && tx.stoppedAt
        ? Math.max(1, (tx.stoppedAt.getTime() - tx.startedAt.getTime()) / 60_000)
        : 0;

    const breakdown = computeSessionCharge({ energyKwh, durationMin, tariff });
    const invoiceNo = `INV-${tx.id}-${Date.now()}`;
    const holdRef = `hold:${tx.idempotencyKey}`;

    await prisma.$transaction(async (db) => {
      await db.transaction.update({
        where: { id: tx.id },
        data: {
          amountPaise: breakdown.totalPaise,
          state: TransactionState.COMPLETED,
        },
      });

      await db.invoice.upsert({
        where: { invoiceNo },
        create: {
          invoiceNo,
          organizationId: tx.organizationId,
          transactionId: tx.id,
          userId: tx.userId!,
          subtotalPaise: breakdown.subtotalPaise,
          gstPaise: breakdown.gstPaise,
          totalPaise: breakdown.totalPaise,
        },
        update: {},
      });
    });

    try {
      await walletService.captureHold(tx.userId, 5000, breakdown.totalPaise, holdRef, `pay:${tx.id}`);
    } catch (err) {
      logger.warn({ err, transactionId: String(tx.id) }, 'wallet capture failed after settle');
    }

    return { invoiceNo };
  }
}

export const billingService = new BillingService();
export const settleAndInvoice = (id: number) => billingService.settleAndInvoice(id);
