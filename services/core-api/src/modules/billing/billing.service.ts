import { TransactionState } from '@prisma/client';
import { AppError } from '../../common/errors.js';
import { prisma } from '../../common/prisma.js';
import { computeSessionCharge, type Tariff } from '../tariff/tariff.engine.js';

/**
 * GST invoice generation — stores metadata; PDF/S3 upload TODO.
 */
export class BillingService {
  async settleAndInvoice(transactionId: number | bigint): Promise<{ invoiceNo: string }> {
    const id = typeof transactionId === 'bigint' ? transactionId : BigInt(transactionId);
    const tx = await prisma.transaction.findUnique({ where: { id } });
    if (!tx?.userId) {
      throw new AppError('transaction_missing', 404, 'transaction_missing');
    }

    // TODO(phase-3): join tariffs table
    const tariff: Tariff = {
      ratePerKwhPaise: 1200,
      ratePerMinPaise: 50,
      slabs: [],
      gstPct: 18,
    };

    const energyKwh = Number(tx.energyKwh ?? 0);
    const durationMin =
      tx.startedAt && tx.stoppedAt
        ? Math.max(1, (tx.stoppedAt.getTime() - tx.startedAt.getTime()) / 60_000)
        : 0;

    const breakdown = computeSessionCharge({ energyKwh, durationMin, tariff });
    const invoiceNo = `INV-${tx.id}-${Date.now()}`;

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
          transactionId: tx.id,
          userId: tx.userId!,
          subtotalPaise: breakdown.subtotalPaise,
          gstPaise: breakdown.gstPaise,
          totalPaise: breakdown.totalPaise,
        },
        update: {},
      });
    });

    // TODO(phase-3): capture wallet hold, upload PDF to S3
    return { invoiceNo };
  }
}

export const billingService = new BillingService();
export const settleAndInvoice = (id: number) => billingService.settleAndInvoice(id);
