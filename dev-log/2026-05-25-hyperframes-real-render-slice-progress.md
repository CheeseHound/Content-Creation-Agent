# Hyperframes Real Render Slice Progress

Date: 2026-05-25

## Current Goal

Replace the mock-only worker ready path with the first real render slice while
preserving the existing SaaS boundaries and avoiding paid external services in
tests.

## Architecture Decisions

- Keep queue payloads storage-key-only and credential-free.
- Keep the mock worker available behind `CONTENT_OPS_WORKER_MODE=mock`, which
  remains the default while the real path is still being hardened.
- Add `CONTENT_OPS_WORKER_MODE=real` as the opt-in path for source download,
  render runner execution, output upload, and output manifest persistence.
- Use dependency-injected worker storage and render runner boundaries so tests
  can run against local filesystem storage and a fixture renderer.
- Persist `render_jobs.output_manifest` only after every rendered output has
  uploaded successfully.
- Sanitize worker failure messages so storage or render command errors do not
  leak credentials or raw runtime details.

## Changed Files

- `ROADMAP.md`
- `apps/worker/README.md`
- `apps/worker/src/config.ts`
- `apps/worker/src/hyperframes-worker.ts`
- `apps/worker/src/index.ts`
- `apps/worker/src/mock-hyperframes-worker.ts`
- `apps/worker/src/postgres-render-worker-repository.ts`
- `apps/worker/src/render-storage.ts`
- `apps/worker/src/render-worker-types.ts`
- `apps/worker/src/render-workspace.ts`
- `apps/worker/tests/config.test.ts`
- `apps/worker/tests/real-hyperframes-worker.test.ts`

## Verification

- `npm run test:worker` passes: 17 passed, 0 failed.
- `npm run test:api` passes: 44 passed, 0 failed.
- `git diff --check` passes.

## Known Blockers

- S3-compatible worker download/upload adapter is not implemented yet; only
  local filesystem storage exists for deterministic tests and local smokes.
- The command runner boundary invokes `HYPERFRAMES_COMMAND render --manifest
  ... --output ...`, but no live Hyperframes/Puppeteer/FFmpeg smoke was run in
  this session.
- Live R2/S3-compatible signed upload smoke test is still pending.
- Local Python is still missing `pytest` from prior sessions.
- Top-level Python `llm` imports still require `openai` for normal import
  paths.
- `assets/videos/` remains unrelated and untracked; leave it alone unless the
  user explicitly asks.

## Recommended Next Action

Run a local real-render smoke with Redis/Postgres plus
`CONTENT_OPS_WORKER_MODE=real` and `CONTENT_OPS_WORKER_LOCAL_STORAGE_ROOT`
pointing at a fixture storage tree. Verify the worker downloads a source
object, executes the configured Hyperframes command, uploads at least one MP4
under `render_output_prefix`, and `GET /api/render-jobs/:id` returns a signed
download for the persisted output manifest. After that, add the S3-compatible
worker storage adapter and run the pending R2 smoke.
