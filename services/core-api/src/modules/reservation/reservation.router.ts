import { Router } from 'express';
import { asyncHandler, validateBody } from '../../common/http.js';
import { requireAuth } from '../../common/middleware/auth.middleware.js';
import { reservationController } from './reservation.controller.js';
import { ReserveSchema } from './reservation.schemas.js';

export const reservationRouter = Router();

reservationRouter.post(
  '/',
  requireAuth,
  validateBody(ReserveSchema),
  asyncHandler(reservationController.create),
);
