import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { AppError } from './errors.js';
import { logger } from './logger.js';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'validation_error', details: err.flatten() });
        return;
      }
      next(err);
    }
  };
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res, next).catch(next);
  };
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.code ?? err.message, message: err.message });
    return;
  }

  const message = err instanceof Error ? err.message : 'internal_error';
  const status =
    message.includes('not connected') || message === 'insufficient_balance' ? 409 : 500;

  if (status >= 500) {
    logger.error({ err }, 'unhandled error');
  }

  res.status(status).json({ error: message });
}
