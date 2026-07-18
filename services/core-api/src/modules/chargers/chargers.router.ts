import { Router } from 'express';
import { asyncHandler, validateBody } from '../../common/http.js';
import { requireAuth } from '../../common/middleware/auth.middleware.js';
import { chargersController } from './chargers.controller.js';
import { CreateChargerSchema } from './chargers.schemas.js';

export const chargersRouter = Router();

chargersRouter.post(
  '/',
  requireAuth,
  validateBody(CreateChargerSchema),
  asyncHandler(chargersController.create),
);
chargersRouter.get('/nearby', asyncHandler(chargersController.nearby));
chargersRouter.get('/:id', asyncHandler(chargersController.getById));
