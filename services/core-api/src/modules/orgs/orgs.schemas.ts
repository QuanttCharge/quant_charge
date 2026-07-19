import { z } from 'zod';

const OrgRoleEnum = z.enum(['org_admin', 'org_operator', 'org_finance', 'driver']);

export const CreateOrgSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens'),
  gstin: z.string().max(32).optional(),
  /** Required: first org_admin invite phone */
  ownerPhone: z.string().min(10).max(20),
});

export const InviteMemberSchema = z.object({
  phone: z.string().min(10).max(20),
  role: OrgRoleEnum,
});

export const AcceptInviteSchema = z.object({
  token: z.string().min(8),
});

export const UpdateRolePermissionsSchema = z.object({
  role: OrgRoleEnum,
  permissions: z.array(z.string()).max(64),
});

export type CreateOrgInput = z.infer<typeof CreateOrgSchema>;
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
export type AcceptInviteInput = z.infer<typeof AcceptInviteSchema>;
export type UpdateRolePermissionsInput = z.infer<typeof UpdateRolePermissionsSchema>;
