# Product Analytics PostHog Sink Progress

Date: 2026-05-27

## Current Goal

Add a production-compatible product analytics sink behind the existing
provider-agnostic analytics boundary.

## Completed

- Added `createProductAnalyticsSink` with `none` and `posthog` modes.
- Added a PostHog-compatible `/capture/` sink using the existing sanitized
  product analytics event payload.
- Added runtime config:
  - `PRODUCT_ANALYTICS_SINK=none|posthog`
  - `POSTHOG_API_KEY`
  - `POSTHOG_HOST` with a default of `https://app.posthog.com`
- Wired the configured sink into API startup while preserving no-op defaults
  for local/in-memory dependency creation.
- Updated the operator observability runbook with the new product analytics
  environment surface.
- Added tests for PostHog request shape, distinct id fallback, sink failures
  without secret leakage, and invalid configuration.

## Changed Files

- `apps/api/src/analytics/sinks.ts`
- `apps/api/src/config.ts`
- `apps/api/src/index.ts`
- `apps/api/src/server.ts`
- `apps/api/tests/config.test.ts`
- `apps/api/tests/operator-observability-docs.test.ts`
- `apps/api/tests/product-analytics-sinks.test.ts`
- `docs/business/shortform-content-ops-operator-runbook.md`
- `ROADMAP.md`

## Verification

- `npm run test:api` passed after implementation before the runbook update.
- `npm run test:api` pending after the runbook and roadmap updates.
- `git diff --check` pending before commit.

## Known Blockers

- Worker/billing callback events are still pending:
  `source_uploaded`, `render_started`, `render_ready`, `render_failed`,
  `output_downloaded`, `checkout_started`, and `subscription_updated`.
- Product analytics delivery failures are intentionally best-effort in API
  flows; alerting on repeated delivery failures would require provider metrics
  or a retry/dead-letter design.

## Recommended Next Action

Continue Phase 4 admin analytics follow-ups by adding storage output counts
from render job output manifests to the internal admin summary.
