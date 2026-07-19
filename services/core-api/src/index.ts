import http from 'node:http';
import cors from 'cors';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { config } from './common/config.js';
import { logger } from './common/logger.js';
import { errorHandler } from './common/http.js';
import { disconnectPrisma } from './common/prisma.js';
import { redis } from './common/redis.js';
import { authRouter } from './modules/auth/auth.router.js';
import { platformRouter } from './modules/platform/platform.router.js';
import { orgsRouter } from './modules/orgs/orgs.router.js';
import { chargersRouter } from './modules/chargers/chargers.router.js';
import { sessionsRouter } from './modules/transactions/sessions.router.js';
import { reservationRouter } from './modules/reservation/reservation.router.js';
import { ocpiRouter } from './modules/ocpi/ocpi.router.js';
import { paymentsRouter } from './modules/payments/payments.router.js';
import { walletRouter } from './modules/wallet/wallet.router.js';
import { startRealtime } from './modules/realtime/realtime.js';

async function main(): Promise<void> {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'core-api' });
  });

  app.use('/auth', authRouter);
  app.use('/platform', platformRouter);
  app.use('/orgs', orgsRouter);
  app.use('/chargers', chargersRouter);
  app.use('/sessions', sessionsRouter);
  app.use('/reservations', reservationRouter);
  app.use('/payments', paymentsRouter);
  app.use('/wallet', walletRouter);
  app.use('/ocpi', ocpiRouter);

  app.use(errorHandler);

  const server = http.createServer(app);
  const realtime = await startRealtime(server);

  server.listen(config.API_PORT, () => {
    logger.info({ port: config.API_PORT }, 'core-api listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down core-api');
    server.close();
    await realtime.stop();
    await redis.quit();
    await disconnectPrisma();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal');
  process.exit(1);
});
