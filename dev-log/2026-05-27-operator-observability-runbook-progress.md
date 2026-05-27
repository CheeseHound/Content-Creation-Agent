# Operator Observability Runbook Progress

Date: 2026-05-27

## Current Goal

Document how operators should use the Phase 4 health, readiness, admin
analytics, and product analytics surfaces without relying on ad hoc database
access.

## Completed

- Added `docs/business/shortform-content-ops-operator-runbook.md`.
- Documented `GET /healthz`, `GET /readyz`, and
  `GET /internal/admin/analytics/summary`.
- Documented `CONTENT_OPS_ADMIN_TOKEN` authorization for the internal admin
  endpoint.
- Documented the reserved product analytics funnel events.
- Documented where operators should look for API health, database health,
  service/worker metrics, product funnel analytics, and support/business views.
- Documented alert candidates for render failures, queue backlog age, worker
  retries, Postgres saturation, storage upload failures, Stripe webhook
  failures, transcription failures, and usage-ledger drift.
- Added a doc test to keep the runbook anchored to the implemented endpoints,
  environment variables, product events, and data-handling prohibitions.

## Changed Files

- `apps/api/tests/operator-observability-docs.test.ts`
- `docs/business/shortform-content-ops-operator-runbook.md`
- `ROADMAP.md`

## Verification

- `npm run test:api` passed after implementation.
- `git diff --check` passed.

## Known Blockers

- Actual alert delivery is still pending.
- PostHog-compatible production analytics sink is still pending.
- Service/worker metrics integration with Grafana or Datadog is still pending.
- Metabase/Retool support dashboards are still pending.

## Recommended Next Action

Wire product analytics events into existing API flows with a no-op/local sink
for tests, then add a production sink implementation behind the same boundary.
