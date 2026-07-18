import type { Request, Response } from 'express';
import type { AuthedRequest } from '../../common/middleware/auth.middleware.js';
import { paymentsService } from './payments.service.js';
import type { CreateOrderInput, WebhookInput } from './payments.schemas.js';

export class PaymentsController {
  createOrder = async (req: Request, res: Response): Promise<void> => {
    const { user } = req as AuthedRequest;
    const result = await paymentsService.createRazorpayOrder(
      user.sub,
      req.body as CreateOrderInput,
    );
    res.status(201).json(result);
  };

  webhook = async (req: Request, res: Response): Promise<void> => {
    const result = await paymentsService.handleRazorpayWebhook(req.body as WebhookInput);
    res.json(result);
  };
}

export const paymentsController = new PaymentsController();
