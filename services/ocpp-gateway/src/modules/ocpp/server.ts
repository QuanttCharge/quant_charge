import uWS from 'uWebSockets.js';
import { v4 as uuidv4 } from 'uuid';
import type { RemoteCommandEnvelope } from '@ev-cms/shared-types';
import { config } from '../../common/config.js';
import { logger } from '../../common/logger.js';
import { isShuttingDown } from '../../common/graceful-shutdown.js';
import { logRawOcppToS3 } from '../../common/s3-raw-logger.js';
import type { RedisRegistry } from '../redis/registry.js';
import type { KafkaProducerService } from '../kafka/producer.js';
import { OcppRouter } from './router.js';

type WsUserData = {
  chargerId: string;
  socketId: string;
};

type HttpRequest = uWS.HttpRequest;
type HttpResponse = uWS.HttpResponse;
type WebSocket = uWS.WebSocket<WsUserData>;
type TemplatedApp = uWS.TemplatedApp;

/**
 * Extract chargerId from path `/ocpp/{chargerId}` and optional Basic Auth.
 */
function parseUpgrade(req: HttpRequest): { chargerId: string; ok: boolean } {
  const url = req.getUrl();
  const parts = url.split('/').filter(Boolean);
  const chargerId = parts[parts.length - 1] ?? '';
  if (!chargerId || chargerId === 'ocpp') {
    return { chargerId: '', ok: false };
  }

  const auth = req.getHeader('authorization');
  if (auth?.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const [user, pass] = decoded.split(':');
    if (user !== config.OCPP_BASIC_AUTH_USER || pass !== config.OCPP_BASIC_AUTH_PASS) {
      return { chargerId, ok: false };
    }
  }
  // TODO(phase-2): Client certificate validation behind TLS terminator
  return { chargerId, ok: true };
}

export function startOcppServer(
  registry: RedisRegistry,
  kafka: KafkaProducerService,
): { app: TemplatedApp; close: () => Promise<void> } {
  const router = new OcppRouter(kafka, registry);
  const sockets = new Map<string, WebSocket>();

  const app = uWS.App().ws<WsUserData>('/*', {
    compression: uWS.SHARED_COMPRESSOR,
    maxPayloadLength: 64 * 1024,
    idleTimeout: 120,
    upgrade: (res: HttpResponse, req: HttpRequest, context: unknown) => {
      if (isShuttingDown()) {
        res.writeStatus('503 Service Unavailable').end('draining');
        return;
      }
      const { chargerId, ok } = parseUpgrade(req);
      if (!ok || !chargerId) {
        res.writeStatus('401 Unauthorized').end('unauthorized');
        return;
      }
      const socketId = uuidv4();
      res.upgrade(
        { chargerId, socketId } satisfies WsUserData,
        req.getHeader('sec-websocket-key'),
        req.getHeader('sec-websocket-protocol') || 'ocpp1.6',
        req.getHeader('sec-websocket-extensions'),
        context,
      );
    },
    open: (ws: WebSocket) => {
      const { chargerId, socketId } = ws.getUserData();
      sockets.set(socketId, ws);
      void registry.register(chargerId, socketId).then(() =>
        registry.subscribeCommands(chargerId, (cmd) => {
          void handleRemoteCommand(ws, router, kafka, cmd);
        }),
      );
      logger.info({ chargerId, socketId }, 'charger connected');
    },
    message: (ws: WebSocket, message: ArrayBuffer, isBinary: boolean) => {
      if (isBinary) return;
      const { chargerId, socketId } = ws.getUserData();
      const raw = Buffer.from(message).toString('utf8');
      void router.handleInbound({
        chargerId,
        socketId,
        raw,
        send: (data) => {
          try {
            ws.send(data);
          } catch (err) {
            logger.warn({ err, chargerId }, 'send failed');
          }
        },
      });
    },
    close: (ws: WebSocket) => {
      const { chargerId, socketId } = ws.getUserData();
      sockets.delete(socketId);
      void registry.unsubscribeCommands(chargerId);
      void registry.unregister(chargerId, socketId);
      void kafka.publishOcppEvent({
        eventId: uuidv4(),
        chargerId,
        action: 'ConnectionClosed',
        messageType: 2,
        uniqueId: uuidv4(),
        payload: { status: 'Offline' },
        receivedAt: new Date().toISOString(),
        instanceId: config.OCPP_INSTANCE_ID,
      });
      logger.info({ chargerId, socketId }, 'charger disconnected');
    },
  });

  app.get('/health', (res: HttpResponse) => {
    res.writeStatus('200 OK').end(JSON.stringify({ status: 'ok', instanceId: config.OCPP_INSTANCE_ID }));
  });

  app.listen(config.OCPP_WS_PORT, (token) => {
    if (token) {
      logger.info({ port: config.OCPP_WS_PORT }, 'OCPP WSS listening');
    } else {
      logger.error('failed to listen');
      process.exit(1);
    }
  });

  return {
    app,
    close: async () => {
      logger.info({ count: sockets.size }, 'draining sockets');
      for (const ws of sockets.values()) {
        try {
          ws.end(1001, 'server shutting down');
        } catch {
          /* ignore */
        }
      }
      sockets.clear();
    },
  };
}

async function handleRemoteCommand(
  ws: WebSocket,
  router: OcppRouter,
  kafka: KafkaProducerService,
  cmd: RemoteCommandEnvelope,
): Promise<void> {
  const frame = router.buildOutboundCall(cmd.type, cmd.payload);
  try {
    ws.send(frame);
    logRawOcppToS3({ chargerId: cmd.chargerId, direction: 'out', raw: frame });
    await kafka.publishCommandAudit(cmd, cmd.chargerId);
    logger.info({ commandId: cmd.commandId, type: cmd.type }, 'remote command sent');
  } catch (err) {
    logger.error({ err, commandId: cmd.commandId }, 'failed to send remote command');
  }
}
