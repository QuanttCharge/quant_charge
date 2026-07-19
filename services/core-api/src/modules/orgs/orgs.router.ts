import { Router } from 'express';
import { asyncHandler, validateBody } from '../../common/http.js';
import {
  requireAuth,
  requirePermission,
  requireRole,
} from '../../common/middleware/auth.middleware.js';
import { orgsController } from './orgs.controller.js';
import {
  AcceptInviteSchema,
  CreateOrgSchema,
  InviteMemberSchema,
  UpdateRolePermissionsSchema,
} from './orgs.schemas.js';

export const orgsRouter = Router();

orgsRouter.use(requireAuth);

orgsRouter.get('/', asyncHandler(orgsController.list));

orgsRouter.post(
  '/',
  requireRole('platform_admin'),
  validateBody(CreateOrgSchema),
  asyncHandler(orgsController.create),
);

orgsRouter.post(
  '/:id/invites',
  requireRole('platform_admin', 'org_admin'),
  requirePermission('members:invite'),
  validateBody(InviteMemberSchema),
  asyncHandler(orgsController.invite),
);

orgsRouter.post(
  '/invites/accept',
  validateBody(AcceptInviteSchema),
  asyncHandler(orgsController.acceptInvite),
);

orgsRouter.get(
  '/:id/role-permissions',
  requireRole('platform_admin', 'org_admin'),
  requirePermission('roles:configure'),
  asyncHandler(orgsController.getRolePermissions),
);

orgsRouter.put(
  '/:id/role-permissions',
  requireRole('platform_admin', 'org_admin'),
  requirePermission('roles:configure'),
  validateBody(UpdateRolePermissionsSchema),
  asyncHandler(orgsController.putRolePermissions),
);
