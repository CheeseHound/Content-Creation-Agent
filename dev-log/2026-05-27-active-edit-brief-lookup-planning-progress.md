# Active Edit Brief Lookup And Planning Contract Progress

Date: 2026-05-27

## Current Goal

Continue the edit brief slice by attaching the active persisted edit brief to
render-job creation, then start the first deterministic edit planning contract.

## Completed

- Added active edit brief lookup to `PostgresEditBriefRepository`.
- Render-job creation now attaches the active source-specific edit brief when
  callers omit `editBrief`.
- Active lookup falls back to the project-level edit brief when no
  source-specific brief exists.
- Explicit request-level `editBrief` still wins and skips active lookup.
- Resolved active edit brief settings are validated before render planning and
  enqueueing; unsafe persisted settings return `invalid_active_edit_brief`
  without creating or enqueueing a render job.
- Queue payload mapping still emits structured settings only and drops raw or
  extra fields such as `chatMessage`.
- Added the first `content_ops.edit_decision_list.v1` planning contract under
  `apps/api/src/edit-planning`.
- Added `edit_decision_lists` to the initial SQL migration as the persistence
  target for downstream planning output.

## Changed Files

- `apps/api/src/edit-briefs/postgres-repository.ts`
- `apps/api/src/edit-briefs/types.ts`
- `apps/api/src/edit-planning/contract.ts`
- `apps/api/src/edit-planning/types.ts`
- `apps/api/src/render-jobs/route.ts`
- `apps/api/src/render-jobs/service.ts`
- `apps/api/src/render-jobs/types.ts`
- `apps/api/src/render-jobs/validation.ts`
- `apps/api/src/server.ts`
- `apps/api/db/migrations/001_initial_content_ops.sql`
- `apps/api/tests/edit-planning.test.ts`
- `apps/api/tests/migrations.test.ts`
- `apps/api/tests/postgres-edit-brief-repository.test.ts`
- `apps/api/tests/render-jobs.test.ts`
- `ROADMAP.md`

## Verification

- `npm run test:api` passed: 63/63.

## Known Blockers

- `content_ops.edit_decision_list.v1` has a pure planner and migration table,
  but no repository or API route yet.
- The planner consumes supplied clip candidates; transcript persistence and
  candidate generation are still pending.
- Live queue-backed real-render smoke and live R2/S3-compatible storage smoke
  remain pending from the worker storage slice.
- The worktree still includes pre-existing worker/storage changes and untracked
  `assets/videos/`; do not revert them without explicit instruction.

## Recommended Next Action

Add repository support for `edit_decision_lists`, connect transcript-derived
clip candidates to `buildEditDecisionList`, then continue the queue-backed
real-render smoke with local Redis/Postgres, local fake storage, and a
Hyperframes command shim or real Hyperframes CLI.
