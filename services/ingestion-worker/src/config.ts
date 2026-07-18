import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().default('ingestion-worker'),
  TIMESCALE_HOST: z.string().default('localhost'),
  TIMESCALE_PORT: z.coerce.number().default(5433),
  TIMESCALE_DB: z.string().default('ev_meter'),
  TIMESCALE_USER: z.string().default('evcms'),
  TIMESCALE_PASSWORD: z.string().default('evcms_secret'),
  BATCH_SIZE: z.coerce.number().default(500),
  FLUSH_INTERVAL_MS: z.coerce.number().default(2000),
});

export const config = EnvSchema.parse(process.env);
