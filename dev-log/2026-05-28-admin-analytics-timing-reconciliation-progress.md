# Admin Analytics Timing And Usage Reconciliation Progress

Date: 2026-05-28

## Current Goal

Continue Phase 4 admin analytics follow-ups after checking the latest handoffs
and roadmap.

## Completed

- Read `DEVLOGS.md`, `ROADMAP.md`, and the latest 2026-05-27 handoffs before
  editing.
- Added dedicated render worker timestamps to `render_jobs`:
  `render_started_at`, `render_completed_at`, and `render_failed_at`.
- Updated the Postgres worker repository so render claims, completions, and
  failures preserve first-seen worker timestamps.
- Added internal admin analytics aggregates for queue latency and render
  duration using the persisted worker timestamps.
- Added usage-ledger reconciliation against ready render jobs:
  ready job count, ledgered job count, unledgered ready jobs, estimated ready
  render minutes, ledgered ready render minutes, and variance.
- Updated the operator runbook and roadmap to reflect the new operator signals.

## Changed Files

- `apps/api/db/migrations/001_initial_content_ops.sql`
- `apps/api/src/admin/analytics/postgres-repository.ts`
- `apps/api/src/admin/analytics/types.ts`
- `apps/api/src/server.ts`
- `apps/api/tests/admin-analytics.test.ts`
- `apps/api/tests/migrations.test.ts`
- `apps/api/tests/operator-observability-docs.test.ts`
- `apps/api/tests/postgres-admin-analytics-repository.test.ts`
- `apps/worker/src/postgres-render-worker-repository.ts`
- `apps/worker/tests/postgres-render-worker-repository.test.ts`
- `docs/business/shortform-content-ops-operator-runbook.md`
- `ROADMAP.md`

## Verification

- `npm run test:api` passed: 91/91.
- `npm run test:worker` passed: 23/23.

## Known Blockers

- Worker/billing callback product analytics events are still pending:
  `source_uploaded`, `render_started`, `render_ready`, `render_failed`,
  `output_downloaded`, `checkout_started`, and `subscription_updated`.
- Actual alert delivery/provider integrations remain pending.
- `content_ops.edit_decision_list.v1` still has a pure planner and table, but
  no repository/API flow connecting transcript-derived candidates to persisted
  decision lists.

## Recommended Next Action

Continue the edit brief slice by adding repository support for
`edit_decision_lists`, then connect transcript-derived clip candidates to
`buildEditDecisionList`. After that, wire worker and billing product analytics
events into the existing provider-agnostic analytics sink.
