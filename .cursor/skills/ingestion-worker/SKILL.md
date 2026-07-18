---
name: ingestion-worker
description: Build the Kafka meter_values batch writer to TimescaleDB. Use when changing hypertables, batch size, or consumer group config.
---

# Ingestion Worker Skill

## Role

High-throughput batch writer: Kafka `meter_values` → TimescaleDB hypertable.

## Design

- Consumer group: `ingestion-worker`
- Buffer up to **500 rows** or flush every **2s** (whichever first)
- Idempotent inserts preferred via `(charger_id, connector_id, sampled_at, measurand)` unique or ON CONFLICT DO NOTHING
- Expect ~1 message / 30–60s per charger at steady state; bursts during active sessions

## Schema (TimescaleDB)

```sql
CREATE TABLE meter_samples (
  time            TIMESTAMPTZ NOT NULL,
  charger_id      TEXT NOT NULL,
  connector_id    INT NOT NULL,
  transaction_id  BIGINT,
  voltage         DOUBLE PRECISION,
  current         DOUBLE PRECISION,
  power           DOUBLE PRECISION,
  energy_kwh      DOUBLE PRECISION,
  soc             DOUBLE PRECISION,
  raw             JSONB
);
SELECT create_hypertable('meter_samples', 'time');
```

## Checklist

- [ ] Batch insert (COPY or multi-VALUES)
- [ ] Backpressure / pause consumer if DB lag
- [ ] pino metrics: flush_size, flush_ms, lag
- [ ] Graceful shutdown: flush buffer before exit
- [ ] No business logic / no Socket.io
