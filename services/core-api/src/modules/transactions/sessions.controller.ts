import type { Request, Response } from 'express';
import type { AuthedRequest } from '../../common/middleware/auth.middleware.js';
import { sessionsService } from './sessions.service.js';
import type { StartSessionInput, StopSessionInput } from './sessions.schemas.js';

export class SessionsController {
  start = async (req: Request, res: Response): Promise<void> => {
    const { user } = req as AuthedRequest;
    const result = await sessionsService.startSession(user, req.body as StartSessionInput);
    res.status(result.idempotent ? 200 : 202).json(result);
  };

  stop = async (req: Request, res: Response): Promise<void> => {
    const { user } = req as AuthedRequest;
    const result = await sessionsService.stopSession(user, req.body as StopSessionInput);
    res.status(202).json(result);
  };
}

export const sessionsController = new SessionsController();
