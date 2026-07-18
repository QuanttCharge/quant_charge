import { z } from 'zod';

/** OCPP 1.6J Call frame: [2, uniqueId, action, payload] */
export const OcppCallSchema = z.tuple([
  z.literal(2),
  z.string().min(1),
  z.string().min(1),
  z.record(z.unknown()),
]);
export type OcppCall = z.infer<typeof OcppCallSchema>;

/** CallResult: [3, uniqueId, payload] */
export const OcppCallResultSchema = z.tuple([
  z.literal(3),
  z.string().min(1),
  z.record(z.unknown()),
]);
export type OcppCallResult = z.infer<typeof OcppCallResultSchema>;

/** CallError: [4, uniqueId, errorCode, errorDescription, errorDetails] */
export const OcppCallErrorSchema = z.tuple([
  z.literal(4),
  z.string().min(1),
  z.string(),
  z.string(),
  z.record(z.unknown()),
]);
export type OcppCallError = z.infer<typeof OcppCallErrorSchema>;

export const OcppMessageSchema = z.union([
  OcppCallSchema,
  OcppCallResultSchema,
  OcppCallErrorSchema,
]);
export type OcppMessage = z.infer<typeof OcppMessageSchema>;

export const SUPPORTED_ACTIONS_16 = [
  'BootNotification',
  'Heartbeat',
  'StatusNotification',
  'Authorize',
  'StartTransaction',
  'StopTransaction',
  'MeterValues',
  'DataTransfer',
] as const;

export type SupportedAction16 = (typeof SUPPORTED_ACTIONS_16)[number];

export const BootNotificationReqSchema = z.object({
  chargePointVendor: z.string(),
  chargePointModel: z.string(),
  chargePointSerialNumber: z.string().optional(),
  chargeBoxSerialNumber: z.string().optional(),
  firmwareVersion: z.string().optional(),
  iccid: z.string().optional(),
  imsi: z.string().optional(),
  meterType: z.string().optional(),
  meterSerialNumber: z.string().optional(),
});

export const HeartbeatReqSchema = z.object({}).passthrough();

export const StatusNotificationReqSchema = z.object({
  connectorId: z.number().int(),
  errorCode: z.string(),
  status: z.string(),
  info: z.string().optional(),
  timestamp: z.string().optional(),
  vendorId: z.string().optional(),
  vendorErrorCode: z.string().optional(),
});

export const AuthorizeReqSchema = z.object({
  idTag: z.string().min(1).max(20),
});

export const StartTransactionReqSchema = z.object({
  connectorId: z.number().int().positive(),
  idTag: z.string().min(1).max(20),
  meterStart: z.number().int(),
  timestamp: z.string(),
  reservationId: z.number().int().optional(),
});

export const StopTransactionReqSchema = z.object({
  meterStop: z.number().int(),
  timestamp: z.string(),
  transactionId: z.number().int(),
  reason: z.string().optional(),
  idTag: z.string().optional(),
  transactionData: z.array(z.unknown()).optional(),
});

export const SampledValueSchema = z.object({
  value: z.string(),
  context: z.string().optional(),
  format: z.string().optional(),
  measurand: z.string().optional(),
  phase: z.string().optional(),
  location: z.string().optional(),
  unit: z.string().optional(),
});

export const MeterValueSchema = z.object({
  timestamp: z.string(),
  sampledValue: z.array(SampledValueSchema).min(1),
});

export const MeterValuesReqSchema = z.object({
  connectorId: z.number().int(),
  transactionId: z.number().int().optional(),
  meterValue: z.array(MeterValueSchema).min(1),
});

export const DataTransferReqSchema = z.object({
  vendorId: z.string(),
  messageId: z.string().optional(),
  data: z.string().optional(),
});

export const actionSchemas: Record<SupportedAction16, z.ZodTypeAny> = {
  BootNotification: BootNotificationReqSchema,
  Heartbeat: HeartbeatReqSchema,
  StatusNotification: StatusNotificationReqSchema,
  Authorize: AuthorizeReqSchema,
  StartTransaction: StartTransactionReqSchema,
  StopTransaction: StopTransactionReqSchema,
  MeterValues: MeterValuesReqSchema,
  DataTransfer: DataTransferReqSchema,
};

/** Forward-compat stub for OCPP 2.0.1 JSON validation (Phase 2+) */
export const Ocpp201ActionHintSchema = z.enum([
  'BootNotification',
  'Heartbeat',
  'StatusNotification',
  'Authorize',
  'TransactionEvent',
  'MeterValues',
  'NotifyEvent',
]);

export function validateCallPayload(action: string, payload: unknown): unknown {
  const schema = actionSchemas[action as SupportedAction16];
  if (!schema) {
    // TODO(phase-2): validate against OCPP 2.0.1 schemas when protocol negotiated
    return payload;
  }
  return schema.parse(payload);
}

export function parseOcppFrame(raw: string): OcppMessage {
  const data: unknown = JSON.parse(raw);
  return OcppMessageSchema.parse(data);
}
