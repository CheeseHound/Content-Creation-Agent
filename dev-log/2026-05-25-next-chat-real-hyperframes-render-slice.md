# Next Chat Prompt: Real Hyperframes Render Slice

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

Context:
We shifted the render strategy from raw FFmpeg-style render payloads to
Hyperframes, the agent-native HTML/browser composition video engine. The
existing SaaS architecture stays intact: Next.js frontend, Fastify/NestJS-
compatible Node API, Postgres usage ledger, BullMQ, and direct Cloudflare
R2/S3-compatible presigned uploads.

Do not modify ingestion, transcription, analysis, billing, or upload flows
unless directly required for the first real worker render slice. Do not touch
the unrelated untracked assets/videos/ directory unless explicitly asked.

Current completed work:
- Commit 1ff522f3 (`feat: add hyperframes render worker scaffold`) was pushed
  to `origin/codex/content-ops-saas-dashboard-intelligence`.
- ROADMAP.md reflects the Hyperframes strategy, worker scaffold, live smoke
  results, and next render-slice direction.
- schemas/content-ops-render-job-v1.schema.json models the Hyperframes render
  intent with template variants, template parameters, style options,
  structured caption timelines, source asset storage keys, composition
  defaults, and MP4 output settings.
- apps/api supports:
  - POST /api/render-jobs with Hyperframes payload validation and BullMQ
    enqueue to content-ops-render.
  - GET /api/render-jobs/:id with signed output downloads for ready jobs.
  - POST /api/uploads/presign with S3-compatible direct upload signing.
  - Postgres migrations and repositories.
  - A fixed pg result normalizer so multi-statement SQL migrations run against
    a fresh live Postgres database.
- src/llm/content_ops/platform.py has Python contract parity for the
  Hyperframes render intent.
- apps/worker exists as a TypeScript worker package with:
  - BullMQ content-ops-render consumer boundary.
  - config loading for DATABASE_URL, REDIS_URL, workspace root, Chromium,
    FFmpeg, Hyperframes command, and concurrency.
  - mock Hyperframes worker path.
  - payload/schema validation and secret-like field rejection.
  - workspace/project-scoped composition directory and manifest writing.
  - source asset reference staging.
  - Postgres render status repository.
  - Dockerfile and README.
  - tests for payload handling, path scoping, no secret leakage,
    retry/idempotency, config, BullMQ dispatch, and Postgres updates.

Verification already run:
- npm run test:api passed: 44/44.
- npm run test:worker passed: 12/12.
- Earlier full npm test passed after the worker scaffold: 2,568/2,568.
- git diff --check passed before commit.
- Live local API-to-worker smoke passed using Homebrew Redis/Postgres:
  - POST /api/render-jobs returned 201.
  - BullMQ recorded two completed jobs and zero failed jobs.
  - Worker consumed jobs and wrote scoped manifests under /tmp.
  - Postgres status path was verified as render_queued -> rendering -> ready.
  - GET /api/render-jobs/:id returned ready with mock `{ "outputs": [] }`.
  - Grep over API responses and worker manifests found no dummy secret values
    or credential-like config fields.

Known blockers:
- The worker still uses the mock ready path and does not download source
  assets, execute Hyperframes/Puppeteer, run FFmpeg, upload MP4 outputs, or
  persist real output manifests.
- Live R2/S3-compatible signed upload smoke test is still pending.
- Local Python is still missing pytest from prior sessions.
- Top-level Python llm imports still require openai for normal import paths.
- assets/videos/ remains unrelated and untracked; leave it alone unless the
  user explicitly asks.

Next task:
Replace the mock worker ready path with the first real render slice.

Recommended scope:
1. Inspect apps/worker, apps/api storage signer contracts, payload schema, and
   the worker smoke dev log before editing.
2. Plan a narrow first real-render slice that preserves the current SaaS
   boundaries:
   - Queue payloads carry storage keys, not credentials.
   - Worker receives storage config through environment/runtime config.
   - Source assets are downloaded into the scoped worker workspace.
   - Hyperframes/Puppeteer/FFmpeg execution is isolated inside the worker.
   - Output assets are uploaded through the S3-compatible boundary.
   - render_jobs.output_manifest is persisted only after output upload
     succeeds.
3. Add worker-side storage download/upload helper interfaces and tests first.
   Prefer dependency-injected helpers so unit tests do not need paid services.
4. Add a local fake storage path or fixture-based implementation for smoke
   testing without Cloudflare/AWS.
5. Add the minimal real render runner boundary:
   - Build or copy a representative Hyperframes workspace/template from the
     validated queue payload.
   - Execute a browser composition path locally.
   - Run FFmpeg MP4 generation.
   - Return output metadata suitable for RenderOutputManifest.
6. Keep the existing mock path available behind an explicit mode flag until
   the real path has reliable local verification.
7. Run focused worker/API tests and, if local services are available, a local
   real-render smoke against Redis/Postgres plus fake/local storage.
8. Update ROADMAP.md and dev-log/ with exact verification, blockers, and the
   next recommended action.

Important:
- The product target is a browser-based SaaS, not a desktop or mobile app.
- Users should eventually see progress in the web dashboard through API status
  reads from Postgres. Postgres is internal operator infrastructure.
- Do not introduce paid external service dependencies for local tests.
- Do not store secrets, credentials, raw customer data, or large generated
  assets in dev logs.
```
