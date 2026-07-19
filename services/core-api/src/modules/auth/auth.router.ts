import { Router } from 'express';
import { asyncHandler, validateBody } from '../../common/http.js';
import { requireAuth } from '../../common/middleware/auth.middleware.js';
import { authController } from './auth.controller.js';
import { OtpRequestSchema, OtpVerifySchema, SelectOrgSchema } from './auth.schemas.js';

export const authRouter = Router();

authRouter.post('/otp', validateBody(OtpRequestSchema), asyncHandler(authController.requestOtp));
authRouter.post(
  '/otp/verify',
  validateBody(OtpVerifySchema),
  asyncHandler(authController.verifyOtp),
);
authRouter.post(
  '/select-org',
  requireAuth,
  validateBody(SelectOrgSchema),
  asyncHandler(authController.selectOrg),
);
authRouter.get('/me', requireAuth, asyncHandler(authController.me));
authRouter.post('/logout', requireAuth, asyncHandler(authController.logout));
