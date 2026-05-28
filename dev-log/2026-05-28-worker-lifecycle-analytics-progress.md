# Worker Lifecycle Analytics Progress

Date: 2026-05-28

## Current Goal

Wire worker-side render lifecycle analytics events without leaking storage keys,
customer media details, credentials, or raw transcript content.

## Completed

- Added a worker analytics event contract for `render_started`,
  `render_ready`, and `render_failed`.
- Added no-op and PostHog-compatible worker analytics sinks.
- Added worker runtime config for `PRODUCT_ANALYTICS_SINK`,
  `POSTHOG_API_KEY`, and optional `POSTHOG_HOST`.
- Mock and real Hyperframes worker paths now emit best-effort lifecycle events
  after render claim, ready, and failure transitions.
- Tests assert worker analytics payloads contain bounded aggregate metadata and
  do not contain storage keys or secret-shaped values.

## Changed Files

- `apps/worker/src/analytics.ts`
- `apps/worker/src/analytics-sinks.ts`
- `apps/worker/src/config.ts`
- `apps/worker/src/index.ts`
- `apps/worker/src/mock-hyperframes-worker.ts`
- `apps/worker/src/hyperframes-worker.ts`
- `apps/worker/tests/analytics-sinks.test.ts`
- `apps/worker/tests/config.test.ts`
- `apps/worker/tests/mock-hyperframes-worker.test.ts`
- `apps/worker/tests/real-hyperframes-worker.test.ts`

## Verification

- `npm run test:worker` passed: 26/26 after this unit.

## Known Blockers

- Upload completion and billing lifecycle analytics remain pending.
- Real alert delivery/provider integrations remain pending.

## Recommended Next Action

Add upload completion and Stripe billing/webhook events, then connect alert
delivery to the operator signals already exposed in admin analytics.
