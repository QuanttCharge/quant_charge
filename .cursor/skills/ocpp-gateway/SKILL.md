---
name: ocpp-gateway
description: Build and extend the stateful OCPP Gateway (uWebSockets, Redis registry, Kafka). Use when working on WSS, OCPP 1.6J handling, connection registry, or remote commands.
---

# OCPP Gateway Skill

## Role

Stateful WebSocket gateway for OCPP 1.6J (and forward-compatible JSON validation). One pod ≈ 5k long-lived connections.

## Hard rules

- **NO business logic** — no tariff, billing, wallet, RBAC, or session pricing.
- Validate → register Redis → publish Kafka → respond with CallResult/CallError.
- Route outbound commands only via Redis PubSub after registry lookup by Core API.

## Layout

```
services/ocpp-gateway/src/
  index.ts
  modules/ocpp/     # handlers, message router, JSON schema validation
  modules/redis/    # registry + cmd subscriber
  modules/kafka/    # producers for ocpp.events, meter_values, commands, alerts
  common/           # logger, config, graceful shutdown, S3 raw logger
```

## Supported Call actions

BootNotification, Heartbeat, StatusNotification, Authorize, StartTransaction, StopTransaction, MeterValues, DataTransfer

## Redis

- `SET charger:{id}` `{instanceId,socketId}` EX 600 on connect / Heartbeat
- `DEL charger:{id}` on disconnect (if still owned by this instance)
- `SUBSCRIBE cmd:{chargerId}` (or pattern `cmd:*`) → send Call to local socket

## Kafka

- MeterValues → topic `meter_values`
- All other events → `ocpp.events`
- Outbound Commands → `commands` (audit)
- Faults / auth failures → `alerts`

## Graceful shutdown

1. Stop accepting new WSS
2. Unsubscribe Redis cmd channels
3. Drain existing sockets up to 60s
4. Flush Kafka producer
5. Exit

## Checklist when adding a handler

- [ ] Zod / OCPP type validation
- [ ] Raw S3 log (async)
- [ ] Kafka publish (correct topic)
- [ ] Registry refresh if Heartbeat/Boot
- [ ] No DB business writes beyond optional status relay via Kafka events
