import { z } from 'zod';

export const CreateSuperAdminsSchema = z.object({
  phones: z.array(z.string().min(10).max(20)).min(1).max(50),
  name: z.string().min(1).max(255).optional(),
});

export type CreateSuperAdminsInput = z.infer<typeof CreateSuperAdminsSchema>;
