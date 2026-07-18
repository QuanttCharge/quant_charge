import { createHash, randomInt } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../../common/config.js';
import { AppError } from '../../common/errors.js';
import { logger } from '../../common/logger.js';
import { prisma } from '../../common/prisma.js';
import type { OtpRequestInput, OtpVerifyInput } from './auth.schemas.js';

function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export class AuthService {
  async requestOtp(input: OtpRequestInput) {
    const code = String(randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + config.OTP_TTL_SECONDS * 1000);

    await prisma.otpChallenge.create({
      data: {
        phone: input.phone,
        codeHash: hashOtp(code),
        expiresAt,
      },
    });

    // TODO(phase-3): send via SMS provider / SMTP mock
    logger.info(
      { phone: input.phone, code: config.NODE_ENV === 'development' ? code : '******' },
      'OTP issued',
    );

    return {
      ok: true as const,
      expiresIn: config.OTP_TTL_SECONDS,
      ...(config.NODE_ENV === 'development' ? { devCode: code } : {}),
    };
  }

  async verifyOtp(input: OtpVerifyInput) {
    const challenge = await prisma.otpChallenge.findFirst({
      where: {
        phone: input.phone,
        codeHash: hashOtp(input.code),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new AppError('invalid_otp', 401, 'invalid_otp');
    }

    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    let user = await prisma.user.findUnique({ where: { phone: input.phone } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          phone: input.phone,
          wallet: { create: {} },
        },
      });
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role, phone: input.phone },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN } as jwt.SignOptions,
    );

    return { token, userId: user.id, role: user.role };
  }
}

export const authService = new AuthService();
