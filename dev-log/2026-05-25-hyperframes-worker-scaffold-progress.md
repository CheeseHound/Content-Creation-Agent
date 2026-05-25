# Hyperframes Worker Scaffold Progress

Date: 2026-05-25

## Current Goal

Build the Phase 3 worker scaffold around the Hyperframes queue payload without
changing ingestion, transcription, analysis, billing, or upload flows.

## Architecture Decisions

- Keep `apps/api` as the producer of `content-ops-render` BullMQ jobs.
- Add `apps/worker` as a separate TypeScript worker package.
- Treat the worker payload as storage-key-only and credential-free.
- Use a mock render path for this phase: validate the payload, claim the
  Postgres render job, create a workspace/project-scoped composition directory,
  stage source asset references, write a Hyperframes workspace manifest, and
  mark the job ready with an empty output manifest.
- Do not run full Hyperframes MP4 rendering yet.
- Model the runtime boundary as Node plus Puppeteer-compatible Chromium,
  FFmpeg, and the Hyperframes CLI.
- Match Postgres render jobs by the queued payload for now because the current
  queue payload does not carry a render job ID.

## Changed Files

- `package.json`
- `ROADMAP.md`
- `apps/worker/package.json`
- `apps/worker/tsconfig.json`
- `apps/worker/Dockerfile`
- `apps/worker/README.md`
- `apps/worker/src/bullmq-render-worker.ts`
- `apps/worker/src/config.ts`
- `apps/worker/src/index.ts`
- `apps/worker/src/mock-hyperframes-worker.ts`
- `apps/worker/src/payload.ts`
- `apps/worker/src/postgres-render-worker-repository.ts`
- `apps/worker/tests/bullmq-render-worker.test.ts`
- `apps/worker/tests/config.test.ts`
- `apps/worker/tests/mock-hyperframes-worker.test.ts`
- `apps/worker/tests/postgres-render-worker-repository.test.ts`

## Verification

- `npm run test:worker` passes: 12 passed, 0 failed.
- `npm run test:api` passes: 41 passed, 0 failed.
- `git diff --check` passes.
- `npm test` passes: 2,568 passed, 0 failed.

## Known Blockers

- No live Redis/BullMQ worker consume smoke test has been run yet.
- No live Postgres worker status-update smoke test has been run yet.
- The worker still uses a mock ready path and does not invoke Hyperframes,
  Puppeteer, or FFmpeg to create MP4 output.
- Local Python is still missing `pytest` from the prior session blocker.
- `assets/videos/` remains unrelated and should not be touched unless
  explicitly requested.

## Recommended Next Action

Run an end-to-end local runtime smoke with development Redis and Postgres:
enqueue a Hyperframes render job through `apps/api`, consume it with
`apps/worker`, verify the scoped workspace manifest on disk, and verify the
render job transitions from `render_queued` to `rendering` to `ready` in
Postgres.
