import { v4 as uuidv4 } from 'uuid';
import {
  parseOcppFrame,
  validateCallPayload,
  type SupportedAction16,
} from '@ev-cms/ocpp-1.6j-types';
import type { MeterValueEnvelope, OcppEventEnvelope } from '@ev-cms/shared-types';
import { logger } from '../../common/logger.js';
import { logRawOcppToS3 } from '../../common/s3-raw-logger.js';
import { config } from '../../common/config.js';
import type { KafkaProducerService } from '../kafka/producer.js';
import type { RedisRegistry } from '../redis/registry.js';

export type SocketSend = (data: string) => void;

/**
 * OCPP message router — validate & publish only. NO business logic.
 */
export class OcppRouter {
  constructor(
    private readonly kafka: KafkaProducerService,
    private readonly registry: RedisRegistry,
  ) {}

  async handleInbound(params: {
    chargerId: string;
    socketId: string;
    raw: string;
    send: SocketSend;
  }): Promise<void> {
    const { chargerId, socketId, raw, send } = params;
    logRawOcppToS3({ chargerId, direction: 'in', raw });

    let frame;
    try {
      frame = parseOcppFrame(raw);
    } catch (err) {
      logger.warn({ err, chargerId }, 'invalid OCPP JSON');
      await this.kafka.publishAlert(
        { chargerId, reason: 'invalid_json', raw },
        chargerId,
      );
      return;
    }

    const messageType = frame[0];
    if (messageType !== 2) {
      // CallResult / CallError from charger in response to CSMS Call
      // TODO(phase-2): correlate pending outbound Calls
      logger.debug({ chargerId, messageType, uniqueId: frame[1] }, 'inbound non-Call');
      return;
    }

    const uniqueId = frame[1];
    const action = frame[2];
    const payload = frame[3];

    try {
      validateCallPayload(action, payload);
    } catch (err) {
      const errorFrame = JSON.stringify([
        4,
        uniqueId,
        'FormationViolation',
        'Payload validation failed',
        {},
      ]);
      send(errorFrame);
      logRawOcppToS3({ chargerId, direction: 'out', raw: errorFrame });
      return;
    }

    await this.registry.refresh(chargerId);

    const result = this.buildCallResult(action as SupportedAction16, payload);
    const enrichedPayload =
      action === 'StartTransaction'
        ? { ...payload, transactionId: result.transactionId }
        : payload;

    const event: OcppEventEnvelope = {
      eventId: uuidv4(),
      chargerId,
      action,
      messageType: 2,
      uniqueId,
      payload: enrichedPayload,
      receivedAt: new Date().toISOString(),
      instanceId: config.OCPP_INSTANCE_ID,
    };

    if (action === 'MeterValues') {
      await this.publishMeterValues(chargerId, payload);
    } else {
      await this.kafka.publishOcppEvent(event);
    }

    // StatusNotification also emits ocpp.events for Core API / Flow 3 consumers
    if (action === 'StatusNotification') {
      // Core API updates Postgres status from Kafka — gateway stays thin
    }

    const resultFrame = JSON.stringify([3, uniqueId, result]);
    send(resultFrame);
    logRawOcppToS3({ chargerId, direction: 'out', raw: resultFrame });

    void socketId; // reserved for pending Call correlation
  }

  private async publishMeterValues(chargerId: string, payload: Record<string, unknown>): Promise<void> {
    const connectorId = Number(payload.connectorId ?? 0);
    const transactionId =
      typeof payload.transactionId === 'number' ? payload.transactionId : undefined;
    const meterValue = (payload.meterValue as Array<{ timestamp: string; sampledValue: Array<{ value: string; measurand?: string; unit?: string }> }>) ?? [];

    for (const mv of meterValue) {
      const envelope: MeterValueEnvelope = {
        eventId: uuidv4(),
        chargerId,
        connectorId,
        transactionId,
        sampledAt: mv.timestamp ?? new Date().toISOString(),
        voltage: pickMeasurand(mv.sampledValue, 'Voltage'),
        current: pickMeasurand(mv.sampledValue, 'Current.Import') ?? pickMeasurand(mv.sampledValue, 'Current.Offered'),
        power: pickMeasurand(mv.sampledValue, 'Power.Active.Import'),
        energyKwh: pickEnergyKwh(mv.sampledValue),
        soc: pickMeasurand(mv.sampledValue, 'SoC'),
        raw: mv,
      };
      await this.kafka.publishMeterValues(envelope);
    }
  }

  /**
   * Minimal protocol acknowledgements only — Core API owns real Authorize/Start decisions via Kafka later.
   * TODO(phase-2): for Authorize/StartTransaction, optionally await Core API via request-reply if required by policy.
   */
  private buildCallResult(action: SupportedAction16, _payload: Record<string, unknown>): Record<string, unknown> {
    const now = new Date().toISOString();
    switch (action) {
      case 'BootNotification':
        return { status: 'Accepted', currentTime: now, interval: 300 };
      case 'Heartbeat':
        return { currentTime: now };
      case 'StatusNotification':
        return {};
      case 'Authorize':
        // Accept at protocol layer; Core API may revoke via future remote commands
        return { idTagInfo: { status: 'Accepted' } };
      case 'StartTransaction':
        // Idempotency for billing is owned by Core API when consuming ocpp.events
        return {
          transactionId: Math.floor(Date.now() % 2_147_483_647),
          idTagInfo: { status: 'Accepted' },
        };
      case 'StopTransaction':
        return { idTagInfo: { status: 'Accepted' } };
      case 'MeterValues':
        return {};
      case 'DataTransfer':
        return { status: 'Accepted' };
      default:
        return {};
    }
  }

  /** Build CSMS → Charge Point Call from Redis command */
  buildOutboundCall(type: string, payload: Record<string, unknown>): string {
    const uniqueId = uuidv4();
    return JSON.stringify([2, uniqueId, type, payload]);
  }
}

function pickMeasurand(
  samples: Array<{ value: string; measurand?: string }>,
  name: string,
): number | undefined {
  const hit = samples.find((s) => s.measurand === name);
  if (!hit) return undefined;
  const n = Number(hit.value);
  return Number.isFinite(n) ? n : undefined;
}

function pickEnergyKwh(
  samples: Array<{ value: string; measurand?: string; unit?: string }>,
): number | undefined {
  const hit = samples.find(
    (s) => s.measurand === 'Energy.Active.Import.Register' || s.measurand === 'Energy.Active.Import.Interval',
  );
  if (!hit) return undefined;
  const n = Number(hit.value);
  if (!Number.isFinite(n)) return undefined;
  if (hit.unit === 'Wh') return n / 1000;
  return n;
}
