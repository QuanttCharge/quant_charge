# Dev smoke runbook

Local path from zero to Flow 1/2 session settle.

## 1. Infra

```bash
cd quant_charge
npm run docker:up
# wait for Postgres healthy
npm run migrate
npm run seed
```

## 2. Services

```bash
# terminals
npm run dev:api          # :3000
npm run dev:ocpp         # :9000
npm run dev:ingestion    # optional meters → Timescale
```

CMS (org users only — no super-admin UI):

```bash
cd quant_charge_fe
npm run dev              # :5173
```

## 3. Super admins (API / seed only — no CMS)

Seed creates `910000000001` as `platform_admin`.

Create more via bootstrap secret (not on frontend):

```bash
# Linux / macOS / Git Bash
curl -s -X POST http://localhost:3000/platform/super-admins \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Secret: dev-bootstrap-secret-change-me" \
  -d '{"phones":["910000000002","910000000003"],"name":"Super Admin"}'
```

PowerShell (Windows) — use `curl.exe` (not `curl`, which is an alias for `Invoke-WebRequest`):

```powershell
curl.exe -s -X POST http://localhost:3000/platform/super-admins `
  -H "Content-Type: application/json" `
  -H "X-Bootstrap-Secret: dev-bootstrap-secret-change-me" `
  -d "{\"phones\":[\"910000000002\"]}"
```

Or native PowerShell:

```powershell
Invoke-RestMethod -Method POST -Uri http://localhost:3000/platform/super-admins `
  -Headers @{ "X-Bootstrap-Secret" = "dev-bootstrap-secret-change-me" } `
  -ContentType "application/json" `
  -Body '{"phones":["910000000002"]}'
```

Or with an existing super-admin JWT:

```bash
curl -s -X POST http://localhost:3000/platform/super-admins \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phones":["910000000004"]}'
```

List:

```bash
curl -s http://localhost:3000/platform/super-admins \
  -H "Authorization: Bearer $SUPER_TOKEN"
```

Onboard a tenant + first org_admin:

```bash
curl -s -X POST http://localhost:3000/platform/orgs \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme CPO","slug":"acme-cpo","ownerPhone":"919811122233"}'
# then OTP-login as ownerPhone to accept membership
```

(`POST /orgs` with platform JWT is equivalent.)

## 4. Auth smoke (org users)

| Phone | Role |
|-------|------|
| `910000000001` | super admin (`platform_admin`) |
| `919876543210` | `org_admin` @ Demo CPO |
| `919999999999` | `driver` @ Demo CPO |

1. `POST /auth/otp` `{ "phone": "919876543210" }` → use `devCode`
2. `POST /auth/otp/verify` → JWT with `orgId` + `role=org_admin`
3. `GET /auth/me` → org + effective `permissions[]`
4. Org admin invites: `POST /orgs/:id/invites` with role `org_operator` | `org_finance` | `driver` | `org_admin`
5. Role permissions: `GET/PUT /orgs/:id/role-permissions` (subset of role ceiling only)

## 5. OCPP Flow 1/2

```bash
node tools/ocpp-simulator/index.mjs
```

Then (with org admin token):

```bash
curl -s -X POST http://localhost:3000/sessions/start \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"chargerId":"CHG001","connectorId":1,"idempotencyKey":"smoke-1"}'

curl -s -X POST http://localhost:3000/sessions/stop \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"transactionId":1,"idempotencyKey":"smoke-1-stop"}'
```

## 6. Checklist

- [ ] Migrations through `004_org_role_permissions.sql`
- [ ] Seed: Demo CPO + CHG001 + super admin + role permission rows
- [ ] Super-admin bootstrap via curl works
- [ ] Self-serve `/orgs/register` removed
- [ ] CMS: no register-org; nav by role including `org_finance`
- [ ] RemoteStart → settle + invoice
