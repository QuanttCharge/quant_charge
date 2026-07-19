import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from '../errors.js';
import { hasPermission, resolvePermissions } from '../rbac.service.js';

/** Roles: platform_admin (super admin) | org_admin | org_operator | org_finance | driver */
export type AuthRole =
  | 'platform_admin'
  | 'org_admin'
  | 'org_operator'
  | 'org_finance'
  | 'driver';

export type AuthPayload = {
  sub: string;
  phone: string;
  role: AuthRole;
  orgId?: string;
  membershipId?: string;
};

export type AuthedRequest = Request & { user: AuthPayload; permissions?: string[] };

export function signAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

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

/** Requires org context unless platform_admin */
export function requireOrg(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthedRequest).user;
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (user.role === 'platform_admin') {
    next();
    return;
  }
  if (!user.orgId) {
    res.status(403).json({ error: 'org_required', message: 'Select an organization first' });
    return;
  }
  next();
}

export function requireRole(...roles: AuthRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthedRequest).user;
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (user.role === 'platform_admin' || roles.includes(user.role)) {
      next();
      return;
    }
    res.status(403).json({ error: 'forbidden', message: `Requires one of: ${roles.join(', ')}` });
  };
}

/** Bootstrap secret OR platform_admin JWT */
export function requireBootstrapOrPlatformAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = req.headers['x-bootstrap-secret'];
  if (typeof secret === 'string' && secret === config.BOOTSTRAP_SECRET) {
    next();
    return;
  }

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), config.JWT_SECRET) as AuthPayload;
      if (payload.role === 'platform_admin') {
        (req as AuthedRequest).user = payload;
        next();
        return;
      }
    } catch {
      /* fall through */
    }
  }

  res.status(401).json({
    error: 'unauthorized',
    message: 'Provide X-Bootstrap-Secret or platform_admin Bearer token',
  });
}

export function requirePermission(...required: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as AuthedRequest).user;
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    try {
      const perms = await resolvePermissions(user);
      (req as AuthedRequest).permissions = perms;
      const ok = required.every((p) => hasPermission(perms, p));
      if (!ok) {
        res.status(403).json({
          error: 'forbidden',
          message: `Requires permission: ${required.join(', ')}`,
        });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Pass if user has at least one of the listed permissions */
export function requireAnyPermission(...required: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as AuthedRequest).user;
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    try {
      const perms = await resolvePermissions(user);
      (req as AuthedRequest).permissions = perms;
      const ok = required.some((p) => hasPermission(perms, p));
      if (!ok) {
        res.status(403).json({
          error: 'forbidden',
          message: `Requires one of: ${required.join(', ')}`,
        });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function getOrgScope(user: AuthPayload): string | undefined {
  if (user.role === 'platform_admin') return undefined;
  return user.orgId;
}

export function assertOrgAccess(user: AuthPayload, resourceOrgId: string | null | undefined): void {
  if (user.role === 'platform_admin') return;
  if (!user.orgId || !resourceOrgId || user.orgId !== resourceOrgId) {
    throw new AppError('forbidden', 403, 'forbidden');
  }
}
