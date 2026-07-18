-- Phase 1: Core relational schema for EV CMS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_role AS ENUM ('driver', 'admin', 'operator', 'cpo');
CREATE TYPE charger_status AS ENUM ('Available', 'Charging', 'Faulted', 'Offline', 'Reserved', 'Unavailable');
CREATE TYPE connector_status AS ENUM ('Available', 'Preparing', 'Charging', 'SuspendedEV', 'SuspendedEVSE', 'Finishing', 'Reserved', 'Unavailable', 'Faulted');
CREATE TYPE transaction_state AS ENUM (
  'PENDING', 'AUTHORIZED', 'CHARGING', 'STOPPING', 'COMPLETED', 'FAILED', 'CANCELLED'
);
CREATE TYPE payment_status AS ENUM ('created', 'authorized', 'captured', 'failed', 'refunded');
CREATE TYPE reservation_status AS ENUM ('active', 'used', 'expired', 'cancelled');
CREATE TYPE rfid_status AS ENUM ('active', 'blocked', 'lost');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         VARCHAR(20) NOT NULL UNIQUE,
  email         VARCHAR(255),
  name          VARCHAR(255),
  role          user_role NOT NULL DEFAULT 'driver',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE otp_challenges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         VARCHAR(20) NOT NULL,
  code_hash     VARCHAR(128) NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_otp_phone ON otp_challenges (phone);

CREATE TABLE chargers (
  id            VARCHAR(64) PRIMARY KEY,
  vendor        VARCHAR(128) NOT NULL,
  model         VARCHAR(128),
  serial_number VARCHAR(128),
  firmware      VARCHAR(64),
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  address       TEXT,
  status        charger_status NOT NULL DEFAULT 'Offline',
  tariff_id     UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_chargers_geo ON chargers (lat, lng);
CREATE INDEX idx_chargers_status ON chargers (status);

CREATE TABLE connectors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charger_id      VARCHAR(64) NOT NULL REFERENCES chargers(id) ON DELETE CASCADE,
  connector_id    INT NOT NULL,
  type            VARCHAR(64),
  max_kw          DOUBLE PRECISION,
  status          connector_status NOT NULL DEFAULT 'Unavailable',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (charger_id, connector_id)
);

CREATE TABLE tariffs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(128) NOT NULL,
  currency        CHAR(3) NOT NULL DEFAULT 'INR',
  rate_per_kwh_paise  INT NOT NULL DEFAULT 0,
  rate_per_min_paise   INT NOT NULL DEFAULT 0,
  slabs           JSONB NOT NULL DEFAULT '[]'::jsonb,
  gst_pct         NUMERIC(5,2) NOT NULL DEFAULT 18.00,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chargers
  ADD CONSTRAINT fk_chargers_tariff FOREIGN KEY (tariff_id) REFERENCES tariffs(id);

CREATE TABLE transactions (
  id                BIGSERIAL PRIMARY KEY,
  idempotency_key   VARCHAR(128) NOT NULL UNIQUE,
  charger_id        VARCHAR(64) NOT NULL REFERENCES chargers(id),
  connector_id      INT NOT NULL,
  user_id           UUID REFERENCES users(id),
  ocpp_transaction_id INT,
  state             transaction_state NOT NULL DEFAULT 'PENDING',
  id_tag            VARCHAR(64),
  meter_start       INT,
  meter_stop        INT,
  energy_kwh        NUMERIC(12,4),
  amount_paise      INT,
  started_at        TIMESTAMPTZ,
  stopped_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tx_charger ON transactions (charger_id, state);
CREATE INDEX idx_tx_user ON transactions (user_id);

CREATE TABLE wallets (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_paise   BIGINT NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
  hold_paise      BIGINT NOT NULL DEFAULT 0 CHECK (hold_paise >= 0),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE wallet_ledger (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id),
  delta_paise     BIGINT NOT NULL,
  reason          VARCHAR(64) NOT NULL,
  ref_id          VARCHAR(128) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ref_id, reason)
);
CREATE INDEX idx_ledger_user ON wallet_ledger (user_id);

CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  provider        VARCHAR(32) NOT NULL DEFAULT 'razorpay',
  amount_paise    INT NOT NULL,
  status          payment_status NOT NULL DEFAULT 'created',
  external_id     VARCHAR(128),
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rfid_tags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  tag_id          VARCHAR(64) NOT NULL UNIQUE,
  status          rfid_status NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE reservations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charger_id      VARCHAR(64) NOT NULL REFERENCES chargers(id),
  connector_id    INT NOT NULL,
  user_id         UUID NOT NULL REFERENCES users(id),
  expires_at      TIMESTAMPTZ NOT NULL,
  status          reservation_status NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reservations_charger ON reservations (charger_id, status);

CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no      VARCHAR(64) NOT NULL UNIQUE,
  transaction_id  BIGINT NOT NULL REFERENCES transactions(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  subtotal_paise  INT NOT NULL,
  gst_paise       INT NOT NULL,
  total_paise     INT NOT NULL,
  s3_key          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
