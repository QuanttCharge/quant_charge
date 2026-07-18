import { Redis } from 'ioredis';
import {
  type ChargerRegistryEntry,
  chargerRegistryKey,
  commandChannel,
  type RemoteCommandEnvelope,
  RemoteCommandEnvelopeSchema,
} from '@ev-cms/shared-types';
import { config } from '../../common/config.js';
import { logger } from '../../common/logger.js';

const REGISTRY_TTL_SECONDS = 600;

export class RedisRegistry {
  readonly client: Redis;
  readonly subscriber: Redis;

  constructor() {
    this.client = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
    this.subscriber = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  }

  async register(chargerId: string, socketId: string): Promise<void> {
    const entry: ChargerRegistryEntry = {
      instanceId: config.OCPP_INSTANCE_ID,
      socketId,
      connectedAt: new Date().toISOString(),
      protocol: 'ocpp1.6',
    };
    await this.client.set(
      chargerRegistryKey(chargerId),
      JSON.stringify(entry),
      'EX',
      REGISTRY_TTL_SECONDS,
    );
  }

  async refresh(chargerId: string): Promise<void> {
    await this.client.expire(chargerRegistryKey(chargerId), REGISTRY_TTL_SECONDS);
  }

  async unregister(chargerId: string, socketId: string): Promise<void> {
    const raw = await this.client.get(chargerRegistryKey(chargerId));
    if (!raw) return;
    try {
      const entry = JSON.parse(raw) as ChargerRegistryEntry;
      if (entry.instanceId === config.OCPP_INSTANCE_ID && entry.socketId === socketId) {
        await this.client.del(chargerRegistryKey(chargerId));
      }
    } catch {
      /* ignore corrupt registry */
    }
  }

  async get(chargerId: string): Promise<ChargerRegistryEntry | null> {
    const raw = await this.client.get(chargerRegistryKey(chargerId));
    if (!raw) return null;
    return JSON.parse(raw) as ChargerRegistryEntry;
  }

  /**
   * Subscribe to cmd:{chargerId} for a connected charger on this instance.
   */
  async subscribeCommands(
    chargerId: string,
    onCommand: (cmd: RemoteCommandEnvelope) => void,
  ): Promise<void> {
    const channel = commandChannel(chargerId);
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (ch, message) => {
      if (ch !== channel) return;
      try {
        const cmd = RemoteCommandEnvelopeSchema.parse(JSON.parse(message));
        onCommand(cmd);
      } catch (err) {
        logger.warn({ err, message }, 'invalid remote command envelope');
      }
    });
  }

  async unsubscribeCommands(chargerId: string): Promise<void> {
    await this.subscriber.unsubscribe(commandChannel(chargerId));
  }

  async close(): Promise<void> {
    await this.subscriber.quit();
    await this.client.quit();
  }
}
