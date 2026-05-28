# Edit Decision List API Progress

Date: 2026-05-28

## Current Goal

Turn the existing pure `content_ops.edit_decision_list.v1` planner into a
persisted API workflow.

## Completed

- Added `POST /api/edit-decision-lists`.
- Added request validation for workspace/project/user/source IDs, explicit
  edit brief references, clip candidates, and transcript segment inputs.
- Added active edit brief lookup when callers omit an explicit edit brief.
- Added `PostgresEditDecisionListRepository` with idempotent persistence into
  `edit_decision_lists`.
- Wired the route and repository into both Postgres runtime dependencies and
  in-memory API test dependencies.
- Added API and repository tests that assert raw transcript text and storage
  keys are not persisted in decision list output or analytics events.

## Changed Files

- `apps/api/src/edit-planning/postgres-repository.ts`
- `apps/api/src/edit-planning/route.ts`
- `apps/api/src/edit-planning/service.ts`
- `apps/api/src/edit-planning/types.ts`
- `apps/api/src/edit-planning/validation.ts`
- `apps/api/src/server.ts`
- `apps/api/tests/edit-decision-lists.test.ts`
- `apps/api/tests/postgres-edit-decision-list-repository.test.ts`
- `ROADMAP.md`

## Verification

- `npm run test:api` passed: 98/98 after this unit.

## Known Blockers

- Decision lists can be created from request-supplied candidates or transcript
  segments, but transcript persistence is still pending.
- Full content profile detection and multimodal scoring remain pending.

## Recommended Next Action

Use transcript segments to derive deterministic clip candidates before
planning, while keeping raw transcript text out of persisted decision list
records.
