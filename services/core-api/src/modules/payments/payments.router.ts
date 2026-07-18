import { Router } from 'express';
import { asyncHandler, validateBody } from '../../common/http.js';
import { requireAuth } from '../../common/middleware/auth.middleware.js';
import { paymentsController } from './payments.controller.js';
import { CreateOrderSchema, WebhookSchema } from './payments.schemas.js';

export const paymentsRouter = Router();

paymentsRouter.post(
  '/razorpay/orders',
  requireAuth,
  validateBody(CreateOrderSchema),
  asyncHandler(paymentsController.createOrder),
);
paymentsRouter.post(
  '/razorpay/webhook',
  validateBody(WebhookSchema),
  asyncHandler(paymentsController.webhook),
);
