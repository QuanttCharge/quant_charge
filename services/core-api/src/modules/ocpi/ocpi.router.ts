import { Router } from 'express';
import { config } from '../../common/config.js';
import { asyncHandler } from '../../common/http.js';

/**
 * Phase 6: OCPI stub for Statiq / Tata Power roaming.
 * TODO(phase-6): implement versions, credentials, locations, sessions, CDR modules.
 */
export const ocpiRouter = Router();

ocpiRouter.use((req, res, next) => {
  const token = req.headers.authorization?.replace(/^Token\s+/i, '');
  if (token !== config.OCPI_TOKEN) {
    res.status(401).json({ status_code: 2001, status_message: 'Unauthorized' });
    return;
  }
  next();
});

ocpiRouter.get(
  '/versions',
  asyncHandler(async (_req, res) => {
    res.json({
      data: [{ version: '2.2.1', url: 'http://localhost:3000/ocpi/2.2.1' }],
      status_code: 1000,
      status_message: 'Success',
      timestamp: new Date().toISOString(),
    });
  }),
);

ocpiRouter.get(
  '/2.2.1',
  asyncHandler(async (_req, res) => {
    res.json({
      data: {
        version: '2.2.1',
        endpoints: [
          { identifier: 'locations', role: 'SENDER', url: 'http://localhost:3000/ocpi/2.2.1/locations' },
          { identifier: 'sessions', role: 'SENDER', url: 'http://localhost:3000/ocpi/2.2.1/sessions' },
          { identifier: 'cdrs', role: 'SENDER', url: 'http://localhost:3000/ocpi/2.2.1/cdrs' },
        ],
      },
      status_code: 1000,
      timestamp: new Date().toISOString(),
    });
  }),
);

ocpiRouter.get(
  '/2.2.1/locations',
  asyncHandler(async (_req, res) => {
    // TODO(phase-6): map chargers table → OCPI Location objects
    res.json({ data: [], status_code: 1000, timestamp: new Date().toISOString() });
  }),
);
