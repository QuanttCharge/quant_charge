# Quant Charge — CPO Platform

Production-grade EV Charging Management System (monorepo).

**Repo root:** `quant_charge/` (npm workspaces still use `@ev-cms/*` package names).

## Architecture

| Service | Role |
|---------|------|
| **ocpp-gateway** | Stateful WSS termination, OCPP 1.6J validate & publish (no business logic) |
| **core-api** | Stateless REST + Socket.io — auth, chargers, sessions, tariff, billing, wallet |
| **ingestion-worker** | Kafka consumer → batch insert meter values into TimescaleDB |

See [docs/HLD.md](docs/HLD.md) for full High-Level Design.

## Quick start

```bash
# 1. Infra (Postgres, TimescaleDB, Redis, Redpanda)
cp .env.example .env
npm run docker:up

# 2. Migrations
npm run migrate

# 3. Install & run services (separate terminals)
npm install
npm run dev:ocpp
npm run dev:api
npm run dev:ingestion
```

## Flows

1. **RemoteStart** — App → Core API → Redis `cmd:{chargerId}` → OCPP Gateway → WSS → Charger
2. **MeterValues** — Charger → OCPP GW → Kafka `meter_values` → Ingestion + Core API Socket.io
3. **Status** — Charger → OCPP GW → Redis registry + Postgres status

## Packages

- `@ev-cms/shared-types` — shared DTOs, Kafka envelopes, Redis keys
- `@ev-cms/ocpp-1.6j-types` — Zod schemas for OCPP 1.6J messages
