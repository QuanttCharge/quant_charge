import pg from 'pg';
import type { MeterValueEnvelope } from '@ev-cms/shared-types';
import { config } from './config.js';
import { logger } from './logger.js';

export class MeterBatchWriter {
  private readonly pool: pg.Pool;
  private buffer: MeterValueEnvelope[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor() {
    this.pool = new pg.Pool({
      host: config.TIMESCALE_HOST,
      port: config.TIMESCALE_PORT,
      database: config.TIMESCALE_DB,
      user: config.TIMESCALE_USER,
      password: config.TIMESCALE_PASSWORD,
      max: 10,
    });
  }

  start(): void {
    this.timer = setInterval(() => {
      void this.flush();
    }, config.FLUSH_INTERVAL_MS);
    this.timer.unref();
  }

  async enqueue(row: MeterValueEnvelope): Promise<void> {
    this.buffer.push(row);
    if (this.buffer.length >= config.BATCH_SIZE) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;
    const batch = this.buffer.splice(0, config.BATCH_SIZE);
    const started = Date.now();
    try {
      await this.insertBatch(batch);
      logger.info(
        { flush_size: batch.length, flush_ms: Date.now() - started },
        'meter batch flushed',
      );
    } catch (err) {
      logger.error({ err, size: batch.length }, 'batch insert failed — requeue');
      this.buffer.unshift(...batch);
    } finally {
      this.flushing = false;
    }
  }

  private async insertBatch(batch: MeterValueEnvelope[]): Promise<void> {
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let i = 1;
    for (const row of batch) {
      placeholders.push(
        `($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`,
      );
      values.push(
        row.sampledAt,
        row.chargerId,
        row.connectorId,
        row.transactionId ?? null,
        row.voltage ?? null,
        row.current ?? null,
        row.power ?? null,
        row.energyKwh ?? null,
        row.soc ?? null,
        JSON.stringify(row.raw ?? {}),
      );
    }

    const sql = `
      INSERT INTO meter_samples
        (time, charger_id, connector_id, transaction_id, voltage, current, power, energy_kwh, soc, raw)
      VALUES ${placeholders.join(',')}`;

    await this.pool.query(sql, values);
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
    await this.pool.end();
  }
}
