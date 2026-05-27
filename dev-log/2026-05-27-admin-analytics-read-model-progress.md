# Admin Analytics Read Model Progress

Date: 2026-05-27

## Current Goal

Continue Phase 4 by adding a bounded internal admin analytics read model and a
dedicated admin authorization boundary.

## Completed

- Added `CONTENT_OPS_ADMIN_TOKEN` runtime config validation.
- Added a static admin authorizer with bearer-token parsing and constant-time
  token comparison.
- Added `GET /internal/admin/analytics/summary`.
- Protected the admin analytics route so missing credentials return `401` and
  invalid credentials return `403` before repository access.
- Added date-window validation with a 90-day maximum range and optional
  `workspaceId` filtering.
- Added `PostgresAdminAnalyticsRepository` with aggregate-only queries for:
  - workspace counts by subscription tier
  - upload count and total uploaded bytes
  - edit brief and version counts
  - edit decision list count
  - render job counts by status
  - render success rate and estimated minutes
  - failure-code distribution
  - usage ledger render minutes
- Wired the admin analytics repository and authorizer into API runtime
  dependencies.

## Changed Files

- `apps/api/src/admin/auth.ts`
- `apps/api/src/admin/analytics/postgres-repository.ts`
- `apps/api/src/admin/analytics/route.ts`
- `apps/api/src/admin/analytics/types.ts`
- `apps/api/src/config.ts`
- `apps/api/src/index.ts`
- `apps/api/src/server.ts`
- `apps/api/tests/admin-analytics.test.ts`
- `apps/api/tests/config.test.ts`
- `apps/api/tests/postgres-admin-analytics-repository.test.ts`
- `ROADMAP.md`

## Verification

- `npm run test:api` passed: 81/81.
- `git diff --check` passed.

## Known Blockers

- Queue latency and render-duration analytics need persisted timing fields from
  the worker lifecycle.
- Storage output counts need output-manifest aggregation once real renders are
  routinely producing persisted manifests.
- Billing and usage-ledger reconciliation still needs Stripe subscription and
  invoice data wired in.
- No PostHog-compatible production analytics sink has been implemented yet.
- Operator documentation and alert thresholds are still pending.

## Recommended Next Action

Add operator documentation for Phase 4 that explains where to check liveness,
readiness, admin analytics, database health, product funnel events, and future
alerts. Then either wire product analytics events into existing API flows or
continue the remaining admin analytics follow-ups once the needed worker/billing
timestamps exist.
