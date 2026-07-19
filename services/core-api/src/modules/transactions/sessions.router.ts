import { Router } from 'express';
import { asyncHandler, validateBody } from '../../common/http.js';
import {
  requireAuth,
  requireOrg,
  requireAnyPermission,
} from '../../common/middleware/auth.middleware.js';
import { sessionsController } from './sessions.controller.js';
import { StartSessionSchema, StopSessionSchema } from './sessions.schemas.js';

export const sessionsRouter = Router();

sessionsRouter.post(
  '/start',
  requireAuth,
  requireOrg,
  requireAnyPermission('sessions:write', 'sessions:own'),
  validateBody(StartSessionSchema),
  asyncHandler(sessionsController.start),
);
sessionsRouter.post(
  '/stop',
  requireAuth,
  requireOrg,
  requireAnyPermission('sessions:write', 'sessions:own'),
  validateBody(StopSessionSchema),
  asyncHandler(sessionsController.stop),
);
