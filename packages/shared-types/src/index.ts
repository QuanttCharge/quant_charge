import { z } from 'zod';

/** Redis connection registry value */
export const ChargerRegistryEntrySchema = z.object({
  instanceId: z.string(),
  socketId: z.string(),
  connectedAt: z.string().datetime(),
  protocol: z.enum(['ocpp1.6', 'ocpp2.0.1']).default('ocpp1.6'),
});
export type ChargerRegistryEntry = z.infer<typeof ChargerRegistryEntrySchema>;

export function chargerRegistryKey(chargerId: string): string {
  return `charger:${chargerId}`;
}

export function commandChannel(chargerId: string): string {
  return `cmd:${chargerId}`;
}

export const KAFKA_TOPICS = {
  OCPP_EVENTS: 'ocpp.events',
  METER_VALUES: 'meter_values',
  COMMANDS: 'commands',
  ALERTS: 'alerts',
} as const;

export const RemoteCommandTypeSchema = z.enum([
  'RemoteStartTransaction',
  'RemoteStopTransaction',
  'ReserveNow',
  'CancelReservation',
  'UnlockConnector',
  'Reset',
  'ChangeAvailability',
]);
export type RemoteCommandType = z.infer<typeof RemoteCommandTypeSchema>;

export const RemoteCommandEnvelopeSchema = z.object({
  commandId: z.string().uuid(),
  type: RemoteCommandTypeSchema,
  chargerId: z.string(),
  payload: z.record(z.unknown()),
  issuedAt: z.string().datetime(),
  correlationId: z.string().optional(),
});
export type RemoteCommandEnvelope = z.infer<typeof RemoteCommandEnvelopeSchema>;

export const OcppEventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  chargerId: z.string(),
  action: z.string(),
  messageType: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  uniqueId: z.string(),
  payload: z.unknown(),
  receivedAt: z.string().datetime(),
  instanceId: z.string(),
});
export type OcppEventEnvelope = z.infer<typeof OcppEventEnvelopeSchema>;

export const MeterValueEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  chargerId: z.string(),
  connectorId: z.number().int(),
  transactionId: z.number().int().optional(),
  sampledAt: z.string().datetime(),
  voltage: z.number().optional(),
  current: z.number().optional(),
  power: z.number().optional(),
  energyKwh: z.number().optional(),
  soc: z.number().optional(),
  raw: z.unknown(),
});
export type MeterValueEnvelope = z.infer<typeof MeterValueEnvelopeSchema>;

export const TransactionStateSchema = z.enum([
  'PENDING',
  'AUTHORIZED',
  'CHARGING',
  'STOPPING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export type TransactionState = z.infer<typeof TransactionStateSchema>;

export const ChargerStatusSchema = z.enum([
  'Available',
  'Charging',
  'Faulted',
  'Offline',
  'Reserved',
  'Unavailable',
]);
export type ChargerStatus = z.infer<typeof ChargerStatusSchema>;
