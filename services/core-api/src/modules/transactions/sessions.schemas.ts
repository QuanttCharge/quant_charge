import { z } from 'zod';

export const StartSessionSchema = z.object({
  chargerId: z.string(),
  connectorId: z.number().int().positive().default(1),
  idTag: z.string().min(1).max(20).optional(),
  idempotencyKey: z.string().min(8).max(128),
});

export const StopSessionSchema = z.object({
  transactionId: z.coerce.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export type StartSessionInput = z.infer<typeof StartSessionSchema>;
export type StopSessionInput = z.infer<typeof StopSessionSchema>;
