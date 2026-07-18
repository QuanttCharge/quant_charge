import type { Request, Response } from 'express';
import type { AuthedRequest } from '../../common/middleware/auth.middleware.js';
import { walletService } from './wallet.service.js';

export class WalletController {
  get = async (req: Request, res: Response): Promise<void> => {
    const { user } = req as AuthedRequest;
    const balance = await walletService.getBalance(user.sub);
    res.json(balance);
  };

  topup = async (req: Request, res: Response): Promise<void> => {
    const { user } = req as AuthedRequest;
    const { amountPaise } = req.body as { amountPaise: number };
    await walletService.topUp(user.sub, amountPaise);
    res.json({ ok: true });
  };
}

export const walletController = new WalletController();
