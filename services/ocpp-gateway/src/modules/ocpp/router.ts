import { v4 as uuidv4 } from 'uuid';
import {
  parseOcppFrame,
  validateCallPayload,
  type SupportedAction16,
} from '@ev-cms/ocpp-1.6j-types';
import type { MeterValueEnvelope, OcppEventEnvelope, RemoteCommandEnvelope } from '@ev-cms/shared-types';
import { logger } from '../../common/logger.js';
import { logRawOcppToS3 } from '../../common/s3-raw-logger.js';
import { config } from '../../common/config.js';
import type { KafkaProducerService } from '../kafka/producer.js';
import type { RedisRegistry } from '../redis/registry.js';

export type SocketSend = (data: string) => void;

export type PendingCall = {
  uniqueId: string;
  commandId: string;
  type: string;
  chargerId: string;
  correlationId?: string;
  issuedAt: string;
};

/**
 * OCPP message router — validate & publish only. NO business logic.
 * Tracks outbound CSMS Calls so CallResult/CallError can be correlated.
 */
export class OcppRouter {
  /** key = `${chargerId}:${uniqueId}` */
  private readonly pendingCalls = new Map<string, PendingCall>();

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
    if (messageType === 3 || messageType === 4) {
      await this.handleCallResponse(chargerId, messageType, frame);
      return;
    }

    if (messageType !== 2) {
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

    const resultFrame = JSON.stringify([3, uniqueId, result]);
    send(resultFrame);
    logRawOcppToS3({ chargerId, direction: 'out', raw: resultFrame });

    void socketId;
  }

  private async handleCallResponse(
    chargerId: string,
    messageType: 3 | 4,
    frame: unknown[],
  ): Promise<void> {
    const uniqueId = String(frame[1]);
    const key = pendingKey(chargerId, uniqueId);
    const pending = this.pendingCalls.get(key);
    this.pendingCalls.delete(key);

    if (!pending) {
      logger.debug({ chargerId, uniqueId, messageType }, 'CallResult with no pending Call');
      return;
    }

    const isError = messageType === 4;
    const payload = isError
      ? {
          errorCode: frame[2],
          errorDescription: frame[3],
          errorDetails: frame[4] ?? {},
        }
      : (frame[2] as Record<string, unknown>);

    await this.kafka.publishCommandAudit(
      {
        kind: isError ? 'CallError' : 'CallResult',
        commandId: pending.commandId,
        type: pending.type,
        chargerId,
        uniqueId,
        correlationId: pending.correlationId,
        issuedAt: pending.issuedAt,
        respondedAt: new Date().toISOString(),
        payload,
      },
      chargerId,
    );

    // Also emit on ocpp.events so Core API / observers can react
    await this.kafka.publishOcppEvent({
      eventId: uuidv4(),
      chargerId,
      action: isError ? `${pending.type}.CallError` : `${pending.type}.CallResult`,
      messageType,
      uniqueId,
      payload: {
        commandId: pending.commandId,
        correlationId: pending.correlationId,
        ...((typeof payload === 'object' && payload) || {}),
      },
      receivedAt: new Date().toISOString(),
      instanceId: config.OCPP_INSTANCE_ID,
    });

    logger.info(
      { commandId: pending.commandId, type: pending.type, isError },
      'correlated CallResult',
    );
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
        return { idTagInfo: { status: 'Accepted' } };
      case 'StartTransaction':
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

  /** Build CSMS → Charge Point Call and register for CallResult correlation */
  buildOutboundCall(cmd: RemoteCommandEnvelope): { frame: string; uniqueId: string } {
    const uniqueId = uuidv4();
    const frame = JSON.stringify([2, uniqueId, cmd.type, cmd.payload]);
    this.pendingCalls.set(pendingKey(cmd.chargerId, uniqueId), {
      uniqueId,
      commandId: cmd.commandId,
      type: cmd.type,
      chargerId: cmd.chargerId,
      correlationId: cmd.correlationId,
      issuedAt: cmd.issuedAt,
    });
    // TTL cleanup — drop stale pending after 2 minutes
    setTimeout(() => {
      this.pendingCalls.delete(pendingKey(cmd.chargerId, uniqueId));
    }, 120_000).unref?.();
    return { frame, uniqueId };
  }

  clearPendingForCharger(chargerId: string): void {
    for (const key of this.pendingCalls.keys()) {
      if (key.startsWith(`${chargerId}:`)) this.pendingCalls.delete(key);
    }
  }
}

function pendingKey(chargerId: string, uniqueId: string): string {
  return `${chargerId}:${uniqueId}`;
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
