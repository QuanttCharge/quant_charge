import type { Request, Response } from 'express';
import type { AuthedRequest } from '../../common/middleware/auth.middleware.js';
import { reservationService } from './reservation.service.js';
import type { ReserveInput } from './reservation.schemas.js';

export class ReservationController {
  create = async (req: Request, res: Response): Promise<void> => {
    const { user } = req as AuthedRequest;
    const result = await reservationService.create(user, req.body as ReserveInput);
    res.status(201).json(result);
  };
}

export const reservationController = new ReservationController();
