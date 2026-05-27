# Observability Health And Analytics Contract Progress

Date: 2026-05-27

## Current Goal

Start Phase 4 by adding safe operational health/readiness checks and a
credential-safe product analytics event contract before broader product
workflow expansion.

## Completed

- Added `GET /healthz` liveness response for process health without dependency
  details.
- Added `GET /readyz` readiness response that aggregates sanitized Postgres,
  queue, and storage configuration checks.
- Added `PostgresObservabilityRepository` for connection health, applied
  migrations, core table availability, and approximate core table row counts.
- Added BullMQ queue health counts through the existing render queue boundary.
- Wired in-memory and Postgres API dependencies into the observability routes.
- Added `PRODUCT_ANALYTICS_EVENTS` and `trackProductAnalyticsEvent` with a
  provider-agnostic sink interface.
- Added analytics property filtering that drops prompt, transcript, credential,
  token/password/secret, storage key, and raw media-shaped fields before events
  reach a sink.

## Changed Files

- `apps/api/src/analytics/product-events.ts`
- `apps/api/src/analytics/types.ts`
- `apps/api/src/observability/postgres-repository.ts`
- `apps/api/src/observability/route.ts`
- `apps/api/src/observability/service.ts`
- `apps/api/src/observability/types.ts`
- `apps/api/src/queue/bullmq-render-queue.ts`
- `apps/api/src/server.ts`
- `apps/api/tests/bullmq-render-queue.test.ts`
- `apps/api/tests/observability.test.ts`
- `apps/api/tests/postgres-observability-repository.test.ts`
- `apps/api/tests/product-analytics.test.ts`
- `ROADMAP.md`

## Verification

- `npm run test:api` passed: 74/74.

## Known Blockers

- Internal admin analytics read models are still pending.
- Dedicated admin authorization for support/admin endpoints is still pending.
- The product analytics contract is not yet wired into upload, edit brief,
  render, billing, or download flows.
- No PostHog-compatible production sink has been implemented yet.
- Operator documentation and alert thresholds are still pending.

## Recommended Next Action

Add a bounded admin analytics repository and protected internal admin API
surface for workspace usage summaries, render funnel counts, failure summaries,
edit brief/decision list activity, and billing/usage-ledger reconciliation.
