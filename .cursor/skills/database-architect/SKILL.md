---
name: database-architect
description: Design Postgres and TimescaleDB schemas, migrations, and indexes for EV CMS. Use when adding tables, hypertables, or changing transaction/charger models.
---

# Database Architect Skill

## Databases

| DB | Engine | Owns |
|----|--------|------|
| `ev_cms` | PostgreSQL | users, chargers, connectors, transactions, tariffs, payments, rfid_tags, reservations, wallets |
| `ev_meter` | TimescaleDB | meter_samples hypertable |

## Core relational tables (minimum)

- `users` — id, phone, role, created_at
- `chargers` — id, vendor, model, serial, location (PostGIS or lat/lng), status
- `connectors` — id, charger_id, connector_id, type, status
- `transactions` — id, charger_id, connector_id, user_id, idempotency_key UNIQUE, state, meter_start/stop, started_at/stopped_at
- `tariffs` — id, name, per_kwh, per_min, slabs JSONB, gst_pct
- `payments` — id, user_id, provider, amount, status, external_id
- `rfid_tags` — id, user_id, tag_id UNIQUE, status
- `wallets` — user_id PK, balance_paise, updated_at
- `wallet_ledger` — id, user_id, delta, reason, ref_id
- `reservations` — id, charger_id, user_id, expires_at, status

## Transaction states

`PENDING` → `AUTHORIZED` → `CHARGING` → `STOPPING` → `COMPLETED` | `FAILED` | `CANCELLED`

## Indexes

- `transactions(idempotency_key)` UNIQUE
- `chargers` geo index on (lat, lng) or geography
- `connectors(charger_id, connector_id)` UNIQUE
- `meter_samples` hypertable + optional compression policy

## ORM

- Core API uses **Prisma** (`services/core-api/prisma/schema.prisma`)
- Keep Prisma models mapped 1:1 with SQL (`@@map` / `@map`)
- After schema changes: update SQL migration **and** Prisma schema, then `npm run prisma:generate -w @ev-cms/core-api`
- TimescaleDB meter hypertable stays outside Prisma (ingestion-worker uses `pg`)

## Migration rules

- Forward-only SQL in `infra/migrations/` (docker bootstrap + `npm run migrate`)
- Never drop columns in the same release that removes code reads
- TimescaleDB scripts live in `infra/timescaledb/`
- Do not use `prisma migrate` against prod until a baseline is cut; prefer SQL + `prisma generate` for now
