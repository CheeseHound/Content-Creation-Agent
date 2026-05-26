# Edit Brief Contract Progress

Date: 2026-05-26

## Current Goal

Implement the backend edit brief contract before building the frontend chat UI.
The contract must support both structured chat output and an empty chat box that
falls back to default tweakable settings.

## Completed

- Added `content_ops.edit_brief.v1` schema at
  `schemas/content-ops-edit-brief-v1.schema.json`.
- Added `apps/api/src/edit-briefs/` with:
  - deterministic default settings for empty chat intent
  - structured edit brief normalization
  - validation for IDs, supported enum values, safe text, moment ranges, and
    secret-shaped content
  - append-only version creation service and route
  - Postgres repository for `edit_briefs` and `edit_brief_versions`
- Wired `POST /api/edit-briefs` into the Node API server and runtime
  dependencies.
- Added `edit_briefs` and `edit_brief_versions` to the initial content-ops SQL
  migration with active-version tracking and idempotency.
- Updated roadmap and architecture docs to note the default settings behavior
  for empty chat input.

## Changed Files

- `apps/api/src/edit-briefs/contract.ts`
- `apps/api/src/edit-briefs/postgres-repository.ts`
- `apps/api/src/edit-briefs/route.ts`
- `apps/api/src/edit-briefs/service.ts`
- `apps/api/src/edit-briefs/types.ts`
- `apps/api/src/edit-briefs/validation.ts`
- `apps/api/src/server.ts`
- `apps/api/db/migrations/001_initial_content_ops.sql`
- `apps/api/tests/edit-briefs.test.ts`
- `apps/api/tests/edit-brief-schema.test.ts`
- `apps/api/tests/postgres-edit-brief-repository.test.ts`
- `apps/api/tests/migrations.test.ts`
- `schemas/content-ops-edit-brief-v1.schema.json`
- `docs/business/shortform-content-ops-saas.md`
- `ROADMAP.md`

## Verification

- `npm run test:api` passed: 51/51.

## Known Blockers

- The chat extraction step is not implemented yet. The API currently accepts
  structured settings or applies deterministic defaults.
- Active edit brief settings are not wired into clip scoring, edit planning,
  render-job payloads, or worker logic yet.
- `edit_constraints` and `edit_decision_lists` are still pending for downstream
  planning output.
- Live queue-backed real-render smoke and live R2/S3-compatible storage smoke
  remain pending from the worker storage slice.

## Recommended Next Action

Add the chat extraction boundary that maps blank or nonblank user messages onto
the existing defaultable edit brief settings, then wire the active edit brief
into clip scoring and render planning. Keep the frontend UI behind this
structured contract so workers never depend on raw prompt text.
