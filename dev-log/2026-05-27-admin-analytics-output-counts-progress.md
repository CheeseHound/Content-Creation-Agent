# Admin Analytics Output Counts Progress

Date: 2026-05-27

## Current Goal

Extend the internal admin analytics summary with storage output counts derived
from persisted render job output manifests.

## Completed

- Added `storage.outputCount` and `storage.totalOutputBytes` to the admin
  analytics summary contract.
- Added a Postgres aggregate over `render_jobs.output_manifest.outputs` using
  `jsonb_array_elements` without returning manifest objects, storage keys, or
  signed URLs.
- Updated the in-memory admin analytics summary used by API server tests.
- Updated admin analytics route and Postgres repository tests.
- Updated the operator observability runbook and roadmap.

## Changed Files

- `apps/api/src/admin/analytics/postgres-repository.ts`
- `apps/api/src/admin/analytics/types.ts`
- `apps/api/src/server.ts`
- `apps/api/tests/admin-analytics.test.ts`
- `apps/api/tests/postgres-admin-analytics-repository.test.ts`
- `docs/business/shortform-content-ops-operator-runbook.md`
- `ROADMAP.md`

## Verification

- `npm run test:api` passed after implementation before doc/roadmap updates.
- `npm run test:api` pending after doc/roadmap updates.
- `git diff --check` pending before commit.

## Known Blockers

- Admin analytics queue latency is still pending.
- Render duration based on persisted worker timestamps is still pending.
- Billing and usage ledger reconciliation is still pending.

## Recommended Next Action

Continue Phase 4 with queue latency or persisted render-duration aggregates,
depending on which timestamp fields are available or should be added next.
