import { Router } from 'express';
import { asyncHandler, validateBody } from '../../common/http.js';
import {
  requireAuth,
  requireOrg,
  requirePermission,
} from '../../common/middleware/auth.middleware.js';
import { chargersController } from './chargers.controller.js';
import { CreateChargerSchema } from './chargers.schemas.js';

export const chargersRouter = Router();

chargersRouter.post(
  '/',
  requireAuth,
  requireOrg,
  requirePermission('chargers:write'),
  validateBody(CreateChargerSchema),
  asyncHandler(chargersController.create),
);
chargersRouter.get('/nearby', asyncHandler(chargersController.nearby));
chargersRouter.get('/:id', asyncHandler(chargersController.getById));
