import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  OCPP_WS_PORT: z.coerce.number().default(9000),
  OCPP_INSTANCE_ID: z.string().default('ocpp-gw-1'),
  OCPP_BASIC_AUTH_USER: z.string().default('charger'),
  OCPP_BASIC_AUTH_PASS: z.string().default('charger_secret'),
  OCPP_DRAIN_TIMEOUT_MS: z.coerce.number().default(60_000),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().default('ocpp-gateway'),
  S3_RAW_LOG_BUCKET: z.string().default('ev-cms-ocpp-raw'),
  AWS_ENDPOINT_URL: z.string().optional(),
  AWS_REGION: z.string().default('ap-south-1'),
  AWS_ACCESS_KEY_ID: z.string().default('test'),
  AWS_SECRET_ACCESS_KEY: z.string().default('test'),
});

export type Config = z.infer<typeof EnvSchema>;

export const config: Config = EnvSchema.parse(process.env);
