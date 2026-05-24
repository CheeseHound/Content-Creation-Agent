# Render Job Schema And Persistence Progress

Date: 2026-05-21

## Current Goal

Continue the backend API MVP for the shortform content ops SaaS after the
initial `POST /api/render-jobs` slice.

## Architecture Decisions

- Added a stable draft-07 JSON schema for the worker queue payload at
  `schemas/content-ops-render-job-v1.schema.json`.
- Kept queue payloads closed via `additionalProperties: false` so credentials
  and accidental fields fail schema validation.
- Added `GET /api/render-jobs/:id` readback using the existing dependency
  injection style.
- Added a generic `PostgresRenderJobRepository` that depends on a `query`
  client shape instead of importing a concrete Postgres package yet.
- Added an initial SQL migration for the SaaS tables and idempotency
  constraints.
- Included the normalized platform set in generated render job IDs to avoid
  collisions when the same asset and clip count are rendered for different
  platform groups.

## Changed Files

- `apps/api/db/migrations/001_initial_content_ops.sql`
- `apps/api/src/render-jobs/postgres-repository.ts`
- `apps/api/src/render-jobs/route.ts`
- `apps/api/src/render-jobs/service.ts`
- `apps/api/src/render-jobs/types.ts`
- `apps/api/src/server.ts`
- `apps/api/tests/migrations.test.ts`
- `apps/api/tests/postgres-repository.test.ts`
- `apps/api/tests/render-job-schema.test.ts`
- `apps/api/tests/render-jobs.test.ts`
- `docs/business/shortform-content-ops-saas.md`
- `ROADMAP.md`
- `schemas/content-ops-render-job-v1.schema.json`

## Verification

- `npm run test:api` passes with 13 tests.
- `npm test` is still blocked by pre-existing Unicode safety violations in
  `skills/windows-desktop-e2e/SKILL.md` and
  `docs/ja-JP/skills/windows-desktop-e2e/SKILL.md`.

## Known Blockers

- Local Python environment is still missing `pytest`.
- Top-level `llm` imports still require `openai` to be installed.
- The API has a Postgres repository boundary and SQL migration, but server
  startup is not wired to a real Postgres client or migration runner yet.
- The queue is still represented by the interface/in-memory scaffold; Redis
  and BullMQ are not wired yet.

## Recommended Next Action

Wire `apps/api` to a real Postgres client and migration runner, then add a
Redis/BullMQ queue adapter for `content-ops-render`. After that, implement
`POST /api/uploads/presign` for direct R2/S3-compatible source uploads.
