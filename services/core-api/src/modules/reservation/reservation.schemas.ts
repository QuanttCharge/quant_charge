import { z } from 'zod';

export const ReserveSchema = z.object({
  chargerId: z.string(),
  connectorId: z.number().int().positive().default(1),
  expiryMinutes: z.number().int().min(5).max(60).default(15),
});

export type ReserveInput = z.infer<typeof ReserveSchema>;
