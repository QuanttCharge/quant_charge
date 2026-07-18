import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  chargerRegistryKey,
  commandChannel,
  type RemoteCommandEnvelope,
  type RemoteCommandType,
} from '@ev-cms/shared-types';
import { config } from './config.js';
import { logger } from './logger.js';

export const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

/**
 * Flow 1: publish command to Redis channel for the OCPP Gateway instance holding the socket.
 * Always check registry first so we can fail fast if charger is offline.
 */
export async function publishChargerCommand(params: {
  type: RemoteCommandType;
  chargerId: string;
  payload: Record<string, unknown>;
  correlationId?: string;
}): Promise<RemoteCommandEnvelope> {
  const registry = await redis.get(chargerRegistryKey(params.chargerId));
  if (!registry) {
    throw new Error(`Charger ${params.chargerId} not connected (missing Redis registry)`);
  }

  const envelope: RemoteCommandEnvelope = {
    commandId: uuidv4(),
    type: params.type,
    chargerId: params.chargerId,
    payload: params.payload,
    issuedAt: new Date().toISOString(),
    correlationId: params.correlationId,
  };

  const channel = commandChannel(params.chargerId);
  await redis.publish(channel, JSON.stringify(envelope));
  logger.info(
    { channel, commandId: envelope.commandId, type: envelope.type },
    'published remote command',
  );
  return envelope;
}
