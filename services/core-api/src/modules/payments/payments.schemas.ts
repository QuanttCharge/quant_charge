import { z } from 'zod';

export const CreateOrderSchema = z.object({
  amountPaise: z.number().int().positive(),
});

export const WebhookSchema = z.object({
  orderId: z.string(),
  status: z.enum(['captured', 'failed']),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type WebhookInput = z.infer<typeof WebhookSchema>;
