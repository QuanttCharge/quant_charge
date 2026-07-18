import type { Request, Response } from 'express';
import { authService } from './auth.service.js';
import type { OtpRequestInput, OtpVerifyInput } from './auth.schemas.js';

export class AuthController {
  requestOtp = async (req: Request, res: Response): Promise<void> => {
    const result = await authService.requestOtp(req.body as OtpRequestInput);
    res.status(200).json(result);
  };

  verifyOtp = async (req: Request, res: Response): Promise<void> => {
    const result = await authService.verifyOtp(req.body as OtpVerifyInput);
    res.json(result);
  };
}

export const authController = new AuthController();
