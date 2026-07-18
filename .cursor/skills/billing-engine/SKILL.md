---
name: billing-engine
description: Implement tariff engine, wallet holds/capture, GST invoices. Use when changing pricing slabs, session billing, or invoice generation.
---

# Billing Engine Skill

## Tariff model

Support simultaneously:

1. **Per kWh** — `energy_kwh * rate_per_kwh`
2. **Per minute** — `duration_min * rate_per_min`
3. **Slab** — progressive brackets on kWh or time (JSONB `slabs`)

Final energy charge = sum of applicable components + GST.

## Wallet flow

1. On session start: **hold** estimated amount (or min balance check)
2. On MeterValues / stop: recompute running cost
3. On COMPLETED: **capture** actual; release remainder
4. On FAILED/CANCELLED: **release** hold

## GST invoice

- Generate sequential invoice number
- Store PDF/JSON on S3
- Line items: energy, time, idle fee (future), GST breakup CGST/SGST or IGST

## Idempotency

- Billing settlement keyed by `transaction_id` — run once
- Wallet ledger entries keyed by `(ref_id, reason)` unique

## Modules

- `core-api/src/modules/tariff`
- `core-api/src/modules/billing`
- `core-api/src/modules/wallet`

## Checklist

- [ ] Integer paise arithmetic (no float money)
- [ ] Timezone-aware session duration
- [ ] Audit ledger for every balance change
- [ ] TODO stubs clearly marked until Phase 3 complete
