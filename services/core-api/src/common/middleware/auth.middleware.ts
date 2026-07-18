import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export type AuthPayload = { sub: string; role: string; phone: string };
export type AuthedRequest = Request & { user: AuthPayload };

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), config.JWT_SECRET) as AuthPayload;
    (req as AuthedRequest).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}
