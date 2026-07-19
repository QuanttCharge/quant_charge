import type { Request, Response } from 'express';
import { platformService } from './platform.service.js';
import type { CreateSuperAdminsInput } from './platform.schemas.js';
import { orgsService } from '../orgs/orgs.service.js';
import type { AuthedRequest } from '../../common/middleware/auth.middleware.js';
import type { CreateOrgInput } from '../orgs/orgs.schemas.js';

export class PlatformController {
  createSuperAdmins = async (req: Request, res: Response): Promise<void> => {
    const result = await platformService.createSuperAdmins(req.body as CreateSuperAdminsInput);
    res.status(201).json(result);
  };

  listSuperAdmins = async (_req: Request, res: Response): Promise<void> => {
    const result = await platformService.listSuperAdmins();
    res.json(result);
  };

  createOrg = async (req: Request, res: Response): Promise<void> => {
    const { user } = req as AuthedRequest;
    const result = await orgsService.createByPlatform(user, req.body as CreateOrgInput);
    res.status(201).json(result);
  };
}

export const platformController = new PlatformController();
