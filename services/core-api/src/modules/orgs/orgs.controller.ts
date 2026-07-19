import type { Request, Response } from 'express';
import type { AuthedRequest } from '../../common/middleware/auth.middleware.js';
import { orgsService } from './orgs.service.js';
import type {
  AcceptInviteInput,
  CreateOrgInput,
  InviteMemberInput,
  UpdateRolePermissionsInput,
} from './orgs.schemas.js';

export class OrgsController {
  create = async (req: Request, res: Response): Promise<void> => {
    const { user } = req as AuthedRequest;
    const result = await orgsService.createByPlatform(user, req.body as CreateOrgInput);
    res.status(201).json(result);
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const { user } = req as AuthedRequest;
    const orgs = await orgsService.listForUser(user);
    res.json({ organizations: orgs });
  };

  invite = async (req: Request, res: Response): Promise<void> => {
    const { user } = req as AuthedRequest;
    const result = await orgsService.invite(user, req.params.id!, req.body as InviteMemberInput);
    res.status(201).json(result);
  };

  acceptInvite = async (req: Request, res: Response): Promise<void> => {
    const { user } = req as AuthedRequest;
    const result = await orgsService.acceptInvite(user, req.body as AcceptInviteInput);
    res.json(result);
  };

  getRolePermissions = async (req: Request, res: Response): Promise<void> => {
    const { user } = req as AuthedRequest;
    const roles = await orgsService.getRolePermissions(user, req.params.id!);
    res.json({ organizationId: req.params.id, roles });
  };

  putRolePermissions = async (req: Request, res: Response): Promise<void> => {
    const { user } = req as AuthedRequest;
    const result = await orgsService.putRolePermissions(
      user,
      req.params.id!,
      req.body as UpdateRolePermissionsInput,
    );
    res.json(result);
  };
}

export const orgsController = new OrgsController();
