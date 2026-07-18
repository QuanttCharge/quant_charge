import { Router } from 'express';
import { asyncHandler, validateBody } from '../../common/http.js';
import { requireAuth } from '../../common/middleware/auth.middleware.js';
import { sessionsController } from './sessions.controller.js';
import { StartSessionSchema, StopSessionSchema } from './sessions.schemas.js';

export const sessionsRouter = Router();

sessionsRouter.post(
  '/start',
  requireAuth,
  validateBody(StartSessionSchema),
  asyncHandler(sessionsController.start),
);
sessionsRouter.post(
  '/stop',
  requireAuth,
  validateBody(StopSessionSchema),
  asyncHandler(sessionsController.stop),
);
