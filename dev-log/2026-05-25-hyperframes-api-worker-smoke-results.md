# Hyperframes API Worker Smoke Results

Date: 2026-05-25

## Current Goal

Run the first live local API-to-worker smoke test without paid external
services.

## Architecture Decisions

- Kept the SaaS architecture intact: API producer, Redis/BullMQ queue,
  Postgres status repository, and mock Hyperframes worker path.
- Used local Homebrew Redis and Postgres because Docker, `redis-cli`, and
  `psql` were not initially available on PATH.
- Used dummy local-only Stripe, OpenAI, and storage environment values for API
  startup validation. No external paid service calls were made.
- Kept worker generated files outside the repo at
  `/tmp/content-ops-worker-smoke`.

## Changed Files

- `ROADMAP.md`
- `apps/api/src/db/postgres-client.ts`
- `apps/api/tests/postgres-client.test.ts`
- `dev-log/2026-05-25-hyperframes-api-worker-smoke-results.md`

## Smoke Setup

- Installed local runtimes with Homebrew:
  `brew install redis postgresql@16`.
- Started temporary local services:
  - Postgres 16 on `127.0.0.1:5432`
  - Redis 8 on `127.0.0.1:6379`
- Created disposable databases:
  - `content_ops_smoke`
  - `content_ops_migration_repro`
- Seeded minimum smoke rows in `content_ops_smoke`: workspace, user,
  membership, active creator subscription, project, and media assets.

## Results

- `POST /api/render-jobs` returned `201 Created` for Hyperframes render jobs.
- Redis/BullMQ recorded two completed jobs on `content-ops-render` and zero
  failed jobs.
- Worker consumed the jobs and wrote manifests under:
  `/tmp/content-ops-worker-smoke/workspaces/smoke_ws/projects/smoke_project/render-jobs/`.
- Postgres status path was verified with a disposable audit trigger:
  `render_queued` -> `rendering` -> `ready`.
- `GET /api/render-jobs/:id` returned `ready` with the mock output manifest
  `{ "outputs": [] }`.
- A grep over API responses and worker manifests found no dummy secret values
  or credential-like config fields.

## Runtime Gap Found And Fixed

- Fresh API startup against an empty live Postgres database initially failed
  during `001_initial_content_ops.sql`.
- Root cause: `pg` returns an array of results for multi-statement SQL, while
  `createPostgresClient.query` assumed a single result with iterable `rows`.
- Fix: normalize single-result, command-only, and multi-statement `pg` results
  before returning rows to repository and migration callers.
- Verified fixed API startup against a fresh `content_ops_migration_repro`
  database with migrations enabled.

## Verification

- `npm run test:api` passes: 44 passed, 0 failed.
- Live local smoke passed for API enqueue, worker consume, manifest writing,
  Postgres ready status, explicit status transition audit, and no secret leak
  scan.

## Known Blockers

- The worker still uses the mock ready path and does not download source
  assets, execute Hyperframes/Puppeteer, run FFmpeg, upload MP4 outputs, or
  persist real output manifests.
- Live R2/S3-compatible signed upload smoke test is still pending.
- Local Python is still missing `pytest` from prior sessions.
- Top-level Python `llm` imports still require `openai` for normal import
  paths.

## Recommended Next Action

Replace the mock worker ready path with the first real render slice: download
source assets by storage key into the scoped worker workspace, execute a
representative Hyperframes browser composition locally, run FFmpeg MP4
generation, upload output assets through the storage boundary, persist a real
output manifest, and finalize usage ledger updates only after successful
output persistence.
