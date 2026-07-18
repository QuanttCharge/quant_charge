import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  API_PORT: z.coerce.number().default(3000),
  JWT_SECRET: z.string().min(8),
  JWT_EXPIRES_IN: z.string().default('7d'),
  OTP_TTL_SECONDS: z.coerce.number().default(300),
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_DB: z.string().default('ev_cms'),
  POSTGRES_USER: z.string().default('evcms'),
  POSTGRES_PASSWORD: z.string().default('evcms_secret'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().default('core-api'),
  SOCKET_IO_CORS_ORIGIN: z.string().default('*'),
  RAZORPAY_KEY_ID: z.string().default('rzp_test_mock'),
  RAZORPAY_KEY_SECRET: z.string().default('mock_secret'),
  FCM_SERVER_KEY: z.string().default('mock_fcm_key'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_FROM: z.string().default('noreply@evcms.local'),
  OCPI_TOKEN: z.string().default('ocpi_mock_token'),
});

export type Config = z.infer<typeof EnvSchema>;

export const config: Config = EnvSchema.parse({
  ...process.env,
  JWT_SECRET: process.env.JWT_SECRET ?? 'dev-only-change-me-please',
});
