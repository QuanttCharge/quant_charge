import { z } from 'zod';

export const OtpRequestSchema = z.object({
  phone: z.string().min(10).max(20),
});

export const OtpVerifySchema = z.object({
  phone: z.string().min(10).max(20),
  code: z.string().length(6),
});

export const SelectOrgSchema = z.object({
  organizationId: z.string().uuid(),
});

export type OtpRequestInput = z.infer<typeof OtpRequestSchema>;
export type OtpVerifyInput = z.infer<typeof OtpVerifySchema>;
export type SelectOrgInput = z.infer<typeof SelectOrgSchema>;
