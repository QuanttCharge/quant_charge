# Phase 6 — deferred

Do **not** implement these until auth + Flow 1/2 E2E + session settle/billing are solid:

| Item | Why deferred |
|------|----------------|
| OCPI roaming | Needs stable org-scoped locations/tariffs/sessions first |
| Real Razorpay capture | Wallet hold/capture path must work in mock first |
| FCM / push notifications | Depends on settled session events |
| PostGIS nearby | Current lat/lng filter is enough for smoke |
| Production k8s hardening | Local compose + seed runbook first |

When ready, resume from Sprint D in the backend next-actions plan.
