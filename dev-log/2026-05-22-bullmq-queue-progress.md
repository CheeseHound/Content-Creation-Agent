# BullMQ Queue Progress

Date: 2026-05-22

## Current Goal

Continue the backend API MVP by replacing the Postgres runtime path's
in-memory render queue with a Redis/BullMQ producer.

## Changes

- Added `bullmq` as a runtime dependency.
- Added `apps/api/src/queue/bullmq-render-queue.ts`.
- The adapter sends only the `content_ops.render_job.v1` worker payload as
  BullMQ job data, uses a SHA-256-derived colon-free job id from the existing
  idempotency key, preserves render priority, and applies bounded retry and job
  retention options.
- Updated API config validation to require `REDIS_URL` in addition to
  `DATABASE_URL`.
- Wired `createPostgresDependencies` to create a BullMQ producer for
  `content-ops-render`, while keeping injected queues available for tests.
- Documented `REDIS_URL` in `.env.example` and refreshed the SaaS docs and
  roadmap.

## Verification

- `npm run test:api` passes: 25 passed, 0 failed.
- `npm test` passes: 2,568 passed, 0 failed.
- `node scripts/ci/scan-supply-chain-iocs.js` passes: 232 files inspected.

## Known Blockers

- Local Python environment is still missing `pytest`.
- Top-level `llm` imports still require `openai` to be installed.
- The Postgres plus Redis runtime path has not yet been smoke-tested against
  live local services.

## Recommended Next Action

Run the API against local Postgres and Redis with migrations enabled, submit a
sample `POST /api/render-jobs`, and verify the BullMQ job lands in
`content-ops-render`. After that, implement `POST /api/uploads/presign` for
direct R2/S3-compatible source uploads.
