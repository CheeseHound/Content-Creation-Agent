# Next Chat Prompt: Real Render Smoke And Worker Storage

Date: 2026-05-25

Use this prompt to continue the shortform content ops SaaS work:

```text
We are in /Users/willis/Documents/Content-Creation-Agent.

First read:
1. AGENTS.md
2. ROADMAP.md
3. DEVLOGS.md
4. dev-log/2026-05-25-hyperframes-render-contract-progress.md
5. dev-log/2026-05-25-hyperframes-worker-scaffold-progress.md
6. dev-log/2026-05-25-hyperframes-api-worker-smoke-results.md
7. dev-log/2026-05-25-hyperframes-real-render-slice-progress.md

Context:
We shifted rendering to Hyperframes while keeping the SaaS architecture intact:
Next.js frontend, Node API, Postgres usage ledger, BullMQ, and direct
Cloudflare R2/S3-compatible uploads.

Do not modify ingestion, transcription, analysis, billing, or upload flows
unless directly required for the worker render/storage slice. Do not touch the
unrelated untracked assets/videos/ directory unless explicitly asked.

Current repo state:
- There are uncommitted changes from the first real worker render slice.
- Commit 1ff522f3 was previously pushed to
  origin/codex/content-ops-saas-dashboard-intelligence before this latest
  uncommitted slice.
- The unrelated untracked assets/videos/ directory is still present and should
  be ignored.

Completed before this prompt:
- API supports Hyperframes render-job payloads, BullMQ enqueue,
  POST /api/render-jobs, GET /api/render-jobs/:id, POST /api/uploads/presign,
  Postgres migrations/repositories, signed output downloads, and fixed pg
  multi-statement migration result handling.
- Worker scaffold exists under apps/worker with BullMQ consume, schema
  validation, Postgres status updates, workspace manifest writing, mock render
  path, Dockerfile, README, and tests.
- Local API-to-worker mock smoke passed with Redis/Postgres:
  POST /api/render-jobs -> BullMQ consume -> worker manifest -> Postgres
  render_queued -> rendering -> ready.

Latest completed slice:
- Added opt-in real worker mode: CONTENT_OPS_WORKER_MODE=real.
- Mock mode remains default: CONTENT_OPS_WORKER_MODE=mock.
- Added apps/worker/src/hyperframes-worker.ts:
  - validates queue payloads
  - claims render jobs
  - downloads source assets into scoped worker workspace
  - writes a real Hyperframes workspace manifest
  - invokes a render runner boundary
  - uploads generated MP4 outputs
  - persists render_jobs.output_manifest only after upload succeeds
  - marks failed with sanitized messages when storage/render/upload fails
- Added apps/worker/src/render-storage.ts:
  - RenderStorageClient interface
  - LocalFilesystemRenderStorage for deterministic tests and no-paid-service
    local smoke runs
- Added apps/worker/src/render-workspace.ts and render-worker-types.ts to share
  path/storage validation and worker result/repository/runtime types between
  mock and real paths.
- Updated apps/worker/src/index.ts to choose mock vs real mode at runtime.
- Updated apps/worker/src/config.ts with:
  - CONTENT_OPS_WORKER_MODE, default mock
  - CONTENT_OPS_WORKER_LOCAL_STORAGE_ROOT, default .content-ops-storage
- Updated apps/worker/README.md and ROADMAP.md.
- Added apps/worker/tests/real-hyperframes-worker.test.ts covering:
  - source download -> render runner -> output upload -> mark ready
  - no markReady when output upload fails
  - local storage path traversal rejection

Verification already run:
- npm run test:worker passed: 17/17.
- npm run test:api passed: 44/44.
- git diff --check passed.

Known blockers:
- No live real-render smoke has been run yet.
- The command runner currently invokes:
  HYPERFRAMES_COMMAND render --manifest <manifest> --output <outputDir>
  This is a boundary assumption that still needs real Hyperframes CLI
  verification and adjustment if the installed CLI expects different flags.
- S3-compatible worker download/upload adapter is not implemented yet; only
  local filesystem storage exists for tests and local smoke.
- Live R2/S3-compatible signed upload smoke is still pending.
- Local Python still lacks pytest.
- Top-level Python llm imports still require openai installed.

Recommended next task:
Run and harden the local real-render smoke, then add the S3-compatible worker
storage adapter.

Recommended scope:
1. Inspect apps/worker/src/hyperframes-worker.ts, render-storage.ts,
   render-workspace.ts, config.ts, index.ts, apps/worker/README.md, and
   dev-log/2026-05-25-hyperframes-real-render-slice-progress.md.
2. Keep changes scoped to worker render/storage unless a smoke reveals a
   directly required API contract issue.
3. Build a no-paid-service smoke path:
   - local Redis/Postgres
   - CONTENT_OPS_WORKER_MODE=real
   - CONTENT_OPS_WORKER_LOCAL_STORAGE_ROOT pointing at a fixture storage tree
   - a fixture source object at the payload source storage key
   - a local HYPERFRAMES_COMMAND shim if the real CLI is unavailable, or the
     actual Hyperframes CLI if installed
4. Verify:
   - worker downloads source into the scoped workspace
   - render command executes and produces at least one MP4
   - worker uploads MP4 under render_output_prefix in local storage
   - Postgres status reaches ready
   - output_manifest has storageKey, filename, contentType, sizeBytes
   - GET /api/render-jobs/:id returns a signed output download for ready jobs
5. If the real Hyperframes CLI contract differs from the assumed command,
   adjust CommandHyperframesRenderRunner and tests around that boundary.
6. Add S3-compatible worker storage adapter using runtime env credentials, not
   queue payload credentials. Do not reuse presigned upload URLs for worker
   internals.
7. Run focused tests:
   - npm run test:worker
   - npm run test:api
   - git diff --check
8. If local services are available, run the real-render smoke and document exact
   commands/results in dev-log/.
9. Update ROADMAP.md and write a new dated dev-log with completed work,
   verification, blockers, and the next recommended action.

Important constraints:
- Queue payloads carry storage keys only, never credentials.
- Persist render_jobs.output_manifest only after upload succeeds.
- Do not finalize usage ledger until real MP4 rendering is reliable enough to
  produce billable output minutes.
- Do not store secrets, credentials, raw customer data, or large generated
  assets in dev logs.
```
