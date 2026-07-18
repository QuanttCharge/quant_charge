import { Kafka, logLevel, type Consumer } from 'kafkajs';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { KAFKA_TOPICS, MeterValueEnvelopeSchema, OcppEventEnvelopeSchema } from '@ev-cms/shared-types';
import { config } from '../../common/config.js';
import { logger } from '../../common/logger.js';
import { chargersService } from '../chargers/chargers.service.js';
import { sessionsService } from '../transactions/sessions.service.js';

/**
 * Phase 5: Kafka meter_values → Socket.io room charger:{id}
 * Also consumes ocpp.events for Flow 3 status + Start/Stop transaction binding.
 */
export async function startRealtime(httpServer: HttpServer): Promise<{
  io: Server;
  stop: () => Promise<void>;
}> {
  const io = new Server(httpServer, {
    cors: { origin: config.SOCKET_IO_CORS_ORIGIN === '*' ? true : config.SOCKET_IO_CORS_ORIGIN },
  });

  io.on('connection', (socket) => {
    socket.on('subscribe:charger', (chargerId: string) => {
      if (typeof chargerId === 'string' && chargerId.length > 0) {
        void socket.join(`charger:${chargerId}`);
      }
    });
  });

  const kafka = new Kafka({
    clientId: config.KAFKA_CLIENT_ID,
    brokers: config.KAFKA_BROKERS.split(','),
    logLevel: logLevel.WARN,
  });

  const meterConsumer: Consumer = kafka.consumer({ groupId: 'core-api-meter' });
  const eventsConsumer: Consumer = kafka.consumer({ groupId: 'core-api-events' });

  await meterConsumer.connect();
  await eventsConsumer.connect();
  await meterConsumer.subscribe({ topic: KAFKA_TOPICS.METER_VALUES, fromBeginning: false });
  await eventsConsumer.subscribe({ topic: KAFKA_TOPICS.OCPP_EVENTS, fromBeginning: false });

  await meterConsumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        const envelope = MeterValueEnvelopeSchema.parse(JSON.parse(message.value.toString()));
        io.to(`charger:${envelope.chargerId}`).emit('meter', envelope);
      } catch (err) {
        logger.warn({ err }, 'meter_values parse failed');
      }
    },
  });

  await eventsConsumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        const event = OcppEventEnvelopeSchema.parse(JSON.parse(message.value.toString()));
        await handleOcppEvent(event);
      } catch (err) {
        logger.warn({ err }, 'ocpp.events parse failed');
      }
    },
  });

  logger.info('realtime kafka consumers started');

  return {
    io,
    stop: async () => {
      await meterConsumer.disconnect();
      await eventsConsumer.disconnect();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}

async function handleOcppEvent(event: {
  chargerId: string;
  action: string;
  payload?: unknown;
}): Promise<void> {
  const payload = (event.payload ?? {}) as Record<string, unknown>;

  if (event.action === 'StatusNotification' || event.action === 'ConnectionClosed') {
    const status =
      event.action === 'ConnectionClosed'
        ? 'Offline'
        : mapConnectorStatusToCharger(String(payload.status ?? 'Unavailable'));
    await chargersService.updateStatus(
      event.chargerId,
      status,
      typeof payload.connectorId === 'number' ? payload.connectorId : undefined,
      typeof payload.status === 'string' ? payload.status : undefined,
    );
  }

  if (event.action === 'StartTransaction') {
    const ocppTxId = Number(payload.transactionId);
    if (!Number.isFinite(ocppTxId)) return;
    await sessionsService.bindStartFromOcpp({
      chargerId: event.chargerId,
      ocppTransactionId: ocppTxId,
      meterStart: typeof payload.meterStart === 'number' ? payload.meterStart : null,
    });
  }

  if (event.action === 'StopTransaction') {
    const ocppTxId = Number(payload.transactionId);
    if (!Number.isFinite(ocppTxId)) return;
    await sessionsService.completeFromOcpp({
      ocppTransactionId: ocppTxId,
      meterStop: typeof payload.meterStop === 'number' ? payload.meterStop : null,
    });
  }
}

function mapConnectorStatusToCharger(status: string): string {
  if (status === 'Charging') return 'Charging';
  if (status === 'Faulted') return 'Faulted';
  if (status === 'Available') return 'Available';
  if (status === 'Reserved') return 'Reserved';
  return 'Unavailable';
}
