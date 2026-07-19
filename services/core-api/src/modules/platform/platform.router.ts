import { Router } from 'express';
import { asyncHandler, validateBody } from '../../common/http.js';
import {
  requireAuth,
  requireBootstrapOrPlatformAdmin,
  requireRole,
} from '../../common/middleware/auth.middleware.js';
import { platformController } from './platform.controller.js';
import { CreateSuperAdminsSchema } from './platform.schemas.js';
import { CreateOrgSchema } from '../orgs/orgs.schemas.js';

export const platformRouter = Router();

platformRouter.post(
  '/super-admins',
  requireBootstrapOrPlatformAdmin,
  validateBody(CreateSuperAdminsSchema),
  asyncHandler(platformController.createSuperAdmins),
);

platformRouter.get(
  '/super-admins',
  requireAuth,
  requireRole('platform_admin'),
  asyncHandler(platformController.listSuperAdmins),
);

platformRouter.post(
  '/orgs',
  requireAuth,
  requireRole('platform_admin'),
  validateBody(CreateOrgSchema),
  asyncHandler(platformController.createOrg),
);
