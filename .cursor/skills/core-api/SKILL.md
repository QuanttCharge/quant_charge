---
name: core-api
description: Build and extend the Core API (Express+TS, JWT/OTP, chargers, sessions, Socket.io). Use for REST APIs, transaction state machine, reservations, and realtime meter fan-out.
---

# Core API Skill

## Role

Stateless REST + Socket.io service for CPO business logic.

## Layering (required)

```
*.router.ts      → wire HTTP path + middleware only
*.controller.ts  → map req/res, call service
*.service.ts     → business logic + Prisma
*.schemas.ts     → Zod DTOs
```

Do **not** put DB queries or domain logic in `*.router.ts`.

## Persistence

- Postgres via **Prisma** (`prisma/schema.prisma`, client in `src/common/prisma.ts`)
- SQL bootstrap remains in `infra/migrations/` for docker init; keep Prisma schema in sync

## Key modules

| Module | Responsibility |
|--------|----------------|
| auth | OTP request/verify, JWT issue, RBAC guards |
| chargers | CRUD, nearby geo query, status from Kafka |
| transactions | Session start/stop state machine, idempotency |
| tariff | per kWh + per min + slab pricing |
| billing | GST invoice generation |
| wallet | balance, hold, capture, refund |
| reservation | ReserveNow orchestration via Redis cmd |
| realtime | Kafka meter_values → Socket.io `charger:{id}` |
| payments | Razorpay mock |
| notifications | FCM/APNS/SMTP mocks |
| ocpi | Statiq / Tata Power OCPI stubs |

## Critical APIs

- `POST /auth/otp` — send OTP
- `POST /auth/otp/verify` — JWT
- `POST /chargers` — register charger
- `GET /chargers/nearby` — lat/lng/radius
- `POST /sessions/start` — publish Redis RemoteStartTransaction
- `POST /sessions/stop` — publish RemoteStopTransaction

## Flow 1 pattern (RemoteStart)

1. Validate JWT + wallet/reservation preconditions
2. Idempotency key check
3. Create pending transaction row
4. `PUBLISH cmd:{chargerId}` with RemoteStartTransaction payload
5. OCPP Gateway delivers Call; charger confirms via StartTransaction event on Kafka
6. Transition state machine → Charging

## Realtime (Phase 5)

- Consume `meter_values`
- Emit to Socket.io room `charger:{chargerId}`

## Checklist

- [ ] Zod in `*.schemas.ts`
- [ ] Logic in `*.service.ts` (Prisma)
- [ ] Thin `*.router.ts`
- [ ] Idempotency for start/stop
- [ ] Never hold WSS to chargers — always Redis cmd channel
- [ ] Graceful shutdown: close HTTP + Socket.io + Kafka + Prisma
