-- TimescaleDB hypertable for meter values
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS meter_samples (
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

SELECT create_hypertable('meter_samples', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_meter_charger_time
  ON meter_samples (charger_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_meter_tx
  ON meter_samples (transaction_id, time DESC)
  WHERE transaction_id IS NOT NULL;

-- Optional: compression after 7 days (enable in prod)
-- ALTER TABLE meter_samples SET (timescaledb.compress, timescaledb.compress_segmentby = 'charger_id');
-- SELECT add_compression_policy('meter_samples', INTERVAL '7 days');
