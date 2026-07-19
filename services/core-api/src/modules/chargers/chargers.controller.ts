import type { Request, Response } from 'express';
import { AppError } from '../../common/errors.js';
import type { AuthedRequest } from '../../common/middleware/auth.middleware.js';
import { chargersService } from './chargers.service.js';
import type { CreateChargerInput } from './chargers.schemas.js';

export class ChargersController {
  create = async (req: Request, res: Response): Promise<void> => {
    const { user } = req as AuthedRequest;
    const result = await chargersService.upsertCharger(user, req.body as CreateChargerInput);
    res.status(201).json(result);
  };

  nearby = async (req: Request, res: Response): Promise<void> => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radiusKm ?? 5);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new AppError('lat_lng_required', 400, 'lat_lng_required');
    }
    const auth = (req as AuthedRequest).user;
    const orgId = auth?.role === 'platform_admin' ? undefined : auth?.orgId;
    const chargers = await chargersService.findNearby(lat, lng, radiusKm, orgId);
    res.json({ chargers });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const auth = (req as Partial<AuthedRequest>).user;
    const charger = await chargersService.getById(req.params.id!, auth);
    res.json(charger);
  };
}

export const chargersController = new ChargersController();
