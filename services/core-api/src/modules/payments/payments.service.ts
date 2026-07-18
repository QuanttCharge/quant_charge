import { PaymentStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../common/config.js';
import { logger } from '../../common/logger.js';
import { prisma } from '../../common/prisma.js';
import { walletService } from '../wallet/wallet.service.js';
import type { CreateOrderInput, WebhookInput } from './payments.schemas.js';

export class PaymentsService {
  async createRazorpayOrder(userId: string, input: CreateOrderInput) {
    const externalId = `order_mock_${uuidv4().slice(0, 8)}`;

    const payment = await prisma.payment.create({
      data: {
        userId,
        provider: 'razorpay',
        amountPaise: input.amountPaise,
        status: PaymentStatus.created,
        externalId,
        meta: { keyId: config.RAZORPAY_KEY_ID },
      },
    });

    logger.info({ paymentId: payment.id, externalId }, 'mock Razorpay order created');

    return {
      paymentId: payment.id,
      orderId: externalId,
      amountPaise: input.amountPaise,
      keyId: config.RAZORPAY_KEY_ID,
    };
  }

  async handleRazorpayWebhook(input: WebhookInput) {
    const status =
      input.status === 'captured' ? PaymentStatus.captured : PaymentStatus.failed;

    const payment = await prisma.payment.updateMany({
      where: { externalId: input.orderId },
      data: { status },
    });

    if (payment.count === 0) {
      return { ok: true as const };
    }

    if (input.status === 'captured') {
      const row = await prisma.payment.findFirst({
        where: { externalId: input.orderId },
      });
      if (row) {
        await walletService.credit(row.userId, row.amountPaise, `pay:${row.id}`);
      }
    }

    return { ok: true as const };
  }
}

export const paymentsService = new PaymentsService();
