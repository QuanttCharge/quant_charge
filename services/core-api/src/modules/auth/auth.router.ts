import { Router } from 'express';
import { asyncHandler, validateBody } from '../../common/http.js';
import { authController } from './auth.controller.js';
import { OtpRequestSchema, OtpVerifySchema } from './auth.schemas.js';

export const authRouter = Router();

authRouter.post('/otp', validateBody(OtpRequestSchema), asyncHandler(authController.requestOtp));
authRouter.post(
  '/otp/verify',
  validateBody(OtpVerifySchema),
  asyncHandler(authController.verifyOtp),
);
