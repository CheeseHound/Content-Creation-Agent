# Product Analytics API Events Progress

Date: 2026-05-27

## Current Goal

Wire the Phase 4 product analytics contract into existing API flows without
introducing a production provider dependency yet.

## Completed

- Added a no-op/local product analytics sink for runtime defaults.
- Added best-effort analytics tracking so sink failures do not fail API work.
- Emitted `upload_presigned` after upload presign media asset persistence.
- Emitted `edit_brief_created` after edit brief version persistence.
- Emitted `render_job_created` after render job persistence and queue enqueue.
- Kept analytics payloads bounded to IDs and aggregate metadata only; tests
  assert filenames, raw edit text, captions, storage keys, and storage paths do
  not enter analytics events.

## Changed Files

- `apps/api/src/analytics/product-events.ts`
- `apps/api/src/analytics/sinks.ts`
- `apps/api/src/edit-briefs/service.ts`
- `apps/api/src/edit-briefs/types.ts`
- `apps/api/src/render-jobs/service.ts`
- `apps/api/src/render-jobs/types.ts`
- `apps/api/src/server.ts`
- `apps/api/src/uploads/service.ts`
- `apps/api/src/uploads/types.ts`
- `apps/api/tests/edit-briefs.test.ts`
- `apps/api/tests/render-jobs.test.ts`
- `apps/api/tests/upload-presign.test.ts`
- `ROADMAP.md`

## Verification

- `npm run test:api` passed after implementation.
- `git diff --check` pending before commit.

## Known Blockers

- PostHog-compatible production sink is still pending.
- Worker/billing callback events are still pending:
  `source_uploaded`, `render_started`, `render_ready`, `render_failed`,
  `output_downloaded`, `checkout_started`, and `subscription_updated`.

## Recommended Next Action

Add the PostHog-compatible product analytics sink behind the existing sink
boundary, with fail-fast configuration validation and tests that prevent secret
or customer media leakage.
