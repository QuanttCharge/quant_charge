import { z } from 'zod';

export const CreateChargerSchema = z.object({
  id: z.string().min(1).max(64),
  vendor: z.string(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  address: z.string().optional(),
  connectors: z
    .array(
      z.object({
        connectorId: z.number().int().positive(),
        type: z.string().optional(),
        maxKw: z.number().optional(),
      }),
    )
    .default([{ connectorId: 1, type: 'CCS2' }]),
});

export type CreateChargerInput = z.infer<typeof CreateChargerSchema>;
