import { logger } from './logger.js';
import { config } from './config.js';

export type ShutdownHook = () => Promise<void> | void;

const hooks: ShutdownHook[] = [];
let shuttingDown = false;

export function onShutdown(hook: ShutdownHook): void {
  hooks.push(hook);
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function installGracefulShutdown(): void {
  const handler = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal, drainMs: config.OCPP_DRAIN_TIMEOUT_MS }, 'graceful shutdown started');

    const timer = setTimeout(() => {
      logger.error('drain timeout exceeded — forcing exit');
      process.exit(1);
    }, config.OCPP_DRAIN_TIMEOUT_MS);
    timer.unref();

    for (const hook of [...hooks].reverse()) {
      try {
        await hook();
      } catch (err) {
        logger.error({ err }, 'shutdown hook failed');
      }
    }
    clearTimeout(timer);
    logger.info('shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void handler('SIGTERM'));
  process.on('SIGINT', () => void handler('SIGINT'));
}
