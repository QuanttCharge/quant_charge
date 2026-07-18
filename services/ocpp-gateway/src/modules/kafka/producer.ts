import { Kafka, type Producer, logLevel } from 'kafkajs';
import {
  KAFKA_TOPICS,
  type MeterValueEnvelope,
  type OcppEventEnvelope,
} from '@ev-cms/shared-types';
import { config } from '../../common/config.js';
import { logger } from '../../common/logger.js';

export class KafkaProducerService {
  private readonly kafka: Kafka;
  private producer: Producer | null = null;

  constructor() {
    this.kafka = new Kafka({
      clientId: config.KAFKA_CLIENT_ID,
      brokers: config.KAFKA_BROKERS.split(','),
      logLevel: logLevel.WARN,
    });
  }

  async connect(): Promise<void> {
    this.producer = this.kafka.producer({ allowAutoTopicCreation: true });
    await this.producer.connect();
    logger.info('kafka producer connected');
  }

  async publishOcppEvent(event: OcppEventEnvelope): Promise<void> {
    await this.send(KAFKA_TOPICS.OCPP_EVENTS, event.chargerId, event);
  }

  async publishMeterValues(event: MeterValueEnvelope): Promise<void> {
    await this.send(KAFKA_TOPICS.METER_VALUES, event.chargerId, event);
  }

  async publishCommandAudit(payload: unknown, key: string): Promise<void> {
    await this.send(KAFKA_TOPICS.COMMANDS, key, payload);
  }

  async publishAlert(payload: unknown, key: string): Promise<void> {
    await this.send(KAFKA_TOPICS.ALERTS, key, payload);
  }

  private async send(topic: string, key: string, value: unknown): Promise<void> {
    if (!this.producer) throw new Error('Kafka producer not connected');
    await this.producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(value) }],
    });
  }

  async disconnect(): Promise<void> {
    await this.producer?.disconnect();
  }
}
