import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from './config.js';
import { logger } from './logger.js';

const s3 = new S3Client({
  region: config.AWS_REGION,
  endpoint: config.AWS_ENDPOINT_URL ?? 'http://localhost:4566',
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Fire-and-forget raw OCPP frame archival. Must never block the WSS hot path.
 */
export function logRawOcppToS3(params: {
  chargerId: string;
  direction: 'in' | 'out';
  raw: string;
}): void {
  const key = `ocpp/${params.chargerId}/${new Date().toISOString()}-${params.direction}.json`;
  void s3
    .send(
      new PutObjectCommand({
        Bucket: config.S3_RAW_LOG_BUCKET,
        Key: key,
        Body: params.raw,
        ContentType: 'application/json',
      }),
    )
    .catch((err: unknown) => {
      logger.warn({ err, key }, 'S3 raw OCPP log failed');
    });
}
