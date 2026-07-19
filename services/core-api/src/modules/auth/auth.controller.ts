import type { Request, Response } from 'express';
import { authService } from './auth.service.js';
import type { OtpRequestInput, OtpVerifyInput, SelectOrgInput } from './auth.schemas.js';
import type { AuthedRequest } from '../../common/middleware/auth.middleware.js';

export class AuthController {
  requestOtp = async (req: Request, res: Response): Promise<void> => {
    const result = await authService.requestOtp(req.body as OtpRequestInput);
    res.status(200).json(result);
  };

  verifyOtp = async (req: Request, res: Response): Promise<void> => {
    const result = await authService.verifyOtp(req.body as OtpVerifyInput);
    res.json(result);
  };

  selectOrg = async (req: Request, res: Response): Promise<void> => {
    const { user } = req as AuthedRequest;
    const result = await authService.selectOrg(user.sub, req.body as SelectOrgInput);
    res.json(result);
  };

  me = async (req: Request, res: Response): Promise<void> => {
    const { user } = req as AuthedRequest;
    const result = await authService.me(user);
    res.json(result);
  };

  logout = async (_req: Request, res: Response): Promise<void> => {
    res.json(authService.logout());
  };
}

export const authController = new AuthController();
