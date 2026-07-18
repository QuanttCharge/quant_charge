import { Kafka, logLevel } from 'kafkajs';
import { KAFKA_TOPICS, MeterValueEnvelopeSchema } from '@ev-cms/shared-types';
import { config } from './config.js';
import { logger } from './logger.js';
import { MeterBatchWriter } from './batch-writer.js';

async function main(): Promise<void> {
  const writer = new MeterBatchWriter();
  writer.start();

  const kafka = new Kafka({
    clientId: config.KAFKA_CLIENT_ID,
    brokers: config.KAFKA_BROKERS.split(','),
    logLevel: logLevel.WARN,
  });

  const consumer = kafka.consumer({ groupId: 'ingestion-worker' });
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPICS.METER_VALUES, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        const envelope = MeterValueEnvelopeSchema.parse(JSON.parse(message.value.toString()));
        await writer.enqueue(envelope);
      } catch (err) {
        logger.warn({ err }, 'skip invalid meter_values message');
      }
    },
  });

  logger.info(
    { batchSize: config.BATCH_SIZE, flushIntervalMs: config.FLUSH_INTERVAL_MS },
    'ingestion-worker consuming meter_values',
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down — flushing buffer');
    await consumer.disconnect();
    await writer.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal');
  process.exit(1);
});
