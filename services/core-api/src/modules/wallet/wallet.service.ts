import { AppError } from '../../common/errors.js';
import { prisma } from '../../common/prisma.js';

export class WalletService {
  async getBalance(userId: string) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    return {
      balance_paise: wallet ? Number(wallet.balancePaise) : 0,
      hold_paise: wallet ? Number(wallet.holdPaise) : 0,
    };
  }

  async hold(userId: string, amountPaise: number, refId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ balance_paise: bigint; hold_paise: bigint }>>`
        SELECT balance_paise, hold_paise FROM wallets WHERE user_id = ${userId}::uuid FOR UPDATE
      `;
      const wallet = rows[0];
      if (!wallet) throw new AppError('wallet_not_found', 404, 'wallet_not_found');

      const available = Number(wallet.balance_paise) - Number(wallet.hold_paise);
      if (available < amountPaise) {
        throw new AppError('insufficient_balance', 409, 'insufficient_balance');
      }

      await tx.wallet.update({
        where: { userId },
        data: { holdPaise: { increment: amountPaise } },
      });

      await tx.walletLedger.createMany({
        data: [
          {
            userId,
            deltaPaise: BigInt(-amountPaise),
            reason: 'hold',
            refId,
          },
        ],
        skipDuplicates: true,
      });
    });
  }

  async releaseHold(userId: string, amountPaise: number, refId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE wallets
        SET hold_paise = GREATEST(hold_paise - ${amountPaise}, 0), updated_at = NOW()
        WHERE user_id = ${userId}::uuid
      `;
      await tx.walletLedger.createMany({
        data: [
          {
            userId,
            deltaPaise: BigInt(amountPaise),
            reason: 'release',
            refId,
          },
        ],
        skipDuplicates: true,
      });
    });
  }

  /** Release hold then debit actual charge amount from balance */
  async captureHold(
    userId: string,
    holdAmountPaise: number,
    capturePaise: number,
    holdRefId: string,
    captureRefId: string,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE wallets
        SET
          hold_paise = GREATEST(hold_paise - ${holdAmountPaise}, 0),
          balance_paise = GREATEST(balance_paise - ${capturePaise}, 0),
          updated_at = NOW()
        WHERE user_id = ${userId}::uuid
      `;
      await tx.walletLedger.createMany({
        data: [
          {
            userId,
            deltaPaise: BigInt(holdAmountPaise),
            reason: 'release',
            refId: holdRefId,
          },
          {
            userId,
            deltaPaise: BigInt(-capturePaise),
            reason: 'capture',
            refId: captureRefId,
          },
        ],
        skipDuplicates: true,
      });
    });
  }

  async credit(userId: string, amountPaise: number, refId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { userId },
        data: { balancePaise: { increment: amountPaise } },
      });
      await tx.walletLedger.createMany({
        data: [
          {
            userId,
            deltaPaise: BigInt(amountPaise),
            reason: 'credit',
            refId,
          },
        ],
        skipDuplicates: true,
      });
    });
  }

  async topUp(userId: string, amountPaise: number): Promise<void> {
    await this.credit(userId, amountPaise, `topup:${Date.now()}`);
  }
}

export const walletService = new WalletService();

export const holdWallet = (userId: string, amount: number, refId: string) =>
  walletService.hold(userId, amount, refId);
export const creditWallet = (userId: string, amount: number, refId: string) =>
  walletService.credit(userId, amount, refId);
export const releaseHold = (userId: string, amount: number, refId: string) =>
  walletService.releaseHold(userId, amount, refId);
