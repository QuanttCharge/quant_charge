import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateBody } from '../../common/http.js';
import {
  requireAuth,
  requireAnyPermission,
} from '../../common/middleware/auth.middleware.js';
import { walletController } from './wallet.controller.js';

export const walletRouter = Router();

walletRouter.get(
  '/',
  requireAuth,
  requireAnyPermission('wallet:read', 'wallet:own', 'wallet:topup'),
  asyncHandler(walletController.get),
);
walletRouter.post(
  '/topup',
  requireAuth,
  requireAnyPermission('wallet:topup', 'wallet:own'),
  validateBody(z.object({ amountPaise: z.number().int().positive() })),
  asyncHandler(walletController.topup),
);
