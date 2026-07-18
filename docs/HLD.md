# EV CMS — Microservices HLD

**Title:** EV CMS - Microservices HLD (OCPP Gateway + Core API + Ingestion Worker)

## Actors

| Actor | Tech |
|-------|------|
| EV Driver App | React Native |
| Admin Panel | React + Mapbox |
| EV Chargers | Exicom, Delta, ABB via OCPP 1.6J WSS |
| External | Razorpay, FCM/APNS, SMTP, OCPI (Statiq, Tata Power) |

## Load Balancers

- **API Gateway ALB** — HTTPS REST, Stateless RoundRobin
- **OCPP LB** — WSS Sticky IP Hash, port 443, long-lived connections (days)

## Microservices

### A) OCPP Gateway (Node.js + uWebSockets)

- Stateful: 1 pod ≈ 5k connections
- WSS termination, OCPP 1.6J handling
- Supported actions: BootNotification, Heartbeat, StatusNotification, Authorize, StartTransaction, StopTransaction, MeterValues, DataTransfer
- **NO business logic** — validate & publish to Kafka + Redis registry only

### B) Core API (Node.js Express + TypeScript)

- Stateless REST + Socket.io
- JWT + OTP Auth, Charger Management, Reservation, Tariff Engine, Billing, Wallet, GST Invoice, RBAC
- Key APIs: `POST /auth/otp`, `POST /chargers`, `POST /sessions/start`, `POST /sessions/stop`, `GET /chargers/nearby`

### C) Ingestion Worker (Node.js)

- Batch writer consuming Kafka `meter_values` (~1 msg / 30–60s per charger)
- Batch insert to TimescaleDB

## Infrastructure

| Component | Purpose |
|-----------|---------|
| Redis Cluster | Connection registry `charger:{id}` → `{instanceId,socketId}` TTL 10m; PubSub `cmd:{chargerId}` for RemoteStart/Stop/ReserveNow/Unlock/Reset |
| Kafka topics | `ocpp.events`, `meter_values`, `commands`, `alerts` |
| PostgreSQL | users, chargers, connectors, transactions, tariffs, payments, rfid_tags |
| TimescaleDB | voltage, current, power, kWh, SoC hypertables |
| S3 | raw OCPP logs, invoices |
| Observability | Prometheus + Grafana + ELK |

## Flows

### Flow 1 (RED) — RemoteStart

```
App → API GW → Core API → PUBLISH Redis cmd:CHG001 RemoteStartTransaction
  → OCPP Gateway (registry lookup) → WSS → Charger
```

### Flow 2 (BLUE) — MeterValues live

```
Charger → WSS MeterValues → OCPP GW → PUBLISH Kafka meter_values
  → Ingestion Worker → TimescaleDB
  AND Core API via Kafka → Socket.io → App Live
```

### Flow 3 (GRAY) — Status sync

```
Charger → OCPP GW → Update Redis + Postgres status (Available/Charging/Faulted/Offline)
```

## NFRs

- Scale to 50k chargers via Redis registry (stateless command routing)
- 3 replicas K8s, graceful shutdown 60s drain
- Security: WSS TLS 1.2+, Basic Auth / Client Cert, JWT
- Idempotency for duplicate StartTransaction

## Implementation phases

1. docker-compose + DB migrations
2. OCPP Gateway
3. Core API
4. Ingestion Worker
5. Realtime Socket.io
6. OCPI + Razorpay + FCM mocks
