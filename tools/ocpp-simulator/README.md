# OCPP Charge Point Simulator

Simulates a 1.6J charger for **Flow 1** (RemoteStart → StartTransaction → MeterValues) and **Flow 2** (RemoteStop → StopTransaction).

## Prerequisites

- OCPP Gateway running (`npm run dev:ocpp` → `:9000`)
- Charger `CHG001` (or your id) seeded in Core API under a demo org

## Run

```bash
# from quant_charge/
node tools/ocpp-simulator/index.mjs

# custom charger / URL
CHARGER_ID=CHG001 OCPP_WS=ws://localhost:9000/ocpp node tools/ocpp-simulator/index.mjs
```

## Smoke (with CMS / API)

1. Seed: `npm run seed`
2. Start gateway + API + simulator
3. Login as demo org admin, `POST /sessions/start` with `chargerId=CHG001`
4. Watch simulator accept RemoteStart and emit meters
5. `POST /sessions/stop` → RemoteStop → settle + invoice
