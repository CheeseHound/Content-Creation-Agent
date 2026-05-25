# Next Chat Prompt: Hyperframes Worker Smoke

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

Context:
We shifted the render strategy from raw FFmpeg-style render payloads to
Hyperframes, the agent-native HTML/browser composition video engine. The
existing SaaS architecture stays intact: Next.js frontend, Fastify/NestJS-
compatible Node API, Postgres usage ledger, BullMQ, and direct Cloudflare
R2/S3-compatible presigned uploads.

Do not modify ingestion, transcription, analysis, billing, or upload flows
unless directly required for the worker smoke test. Do not touch the unrelated
untracked assets/videos/ directory unless explicitly asked.

Current completed work:
- ROADMAP.md reflects the Hyperframes strategy and Phase 3 worker scaffold.
- schemas/content-ops-render-job-v1.schema.json models the Hyperframes render
  intent.
- apps/api supports Hyperframes queue payloads with template variants,
  template parameters, style options, structured caption timelines, source
  asset storage keys, fixed vertical composition defaults, and MP4 output
  settings.
- Python contract parity was added in src/llm/content_ops/platform.py.
- apps/worker now exists as a separate TypeScript worker package with:
  - BullMQ content-ops-render consumer boundary
  - config loading for DATABASE_URL, REDIS_URL, workspace root, Chromium,
    FFmpeg, Hyperframes command, and concurrency
  - mock Hyperframes worker path
  - payload/schema validation
  - workspace/project-scoped composition directory and manifest writing
  - source asset reference staging
  - Postgres render status repository
  - Dockerfile and README
  - tests for payload handling, path scoping, no secret leakage,
    retry/idempotency, config, BullMQ dispatch, and Postgres updates

Verification already run:
- npm run test:worker passes: 12/12
- npm run test:api passes: 41/41
- npm test passes: 2,568/2,568
- git diff --check passes
- Prior Python py_compile passed, but pytest could not run because local Python
  is missing pytest.

Known blockers:
- No live Redis/BullMQ worker consume smoke test has been run yet.
- No live Postgres worker status-update smoke test has been run yet.
- The worker still uses a mock ready path and does not invoke Hyperframes,
  Puppeteer, or FFmpeg to produce an MP4.
- Top-level Python llm imports still need openai installed for normal import
  paths.

Next task:
Run the first live local API-to-worker smoke test without paid external
services.

Recommended scope:
1. Inspect package scripts, apps/api runtime config, apps/worker runtime config,
   and the initial Postgres migration.
2. Determine whether local Redis/Postgres are already available. Prefer local
   services only. Do not use paid Cloudflare, Stripe, or OpenAI APIs.
3. If needed and available, use local Docker or existing local services to
   start Redis and Postgres.
4. Seed the minimum Postgres records needed for a render-job request:
   workspace, user, membership, project, media asset, and subscription if
   required.
5. Start apps/api and apps/worker against the same Redis/Postgres.
6. Submit a valid Hyperframes render job to POST /api/render-jobs.
7. Verify:
   - API accepts and enqueues the job.
   - Worker consumes the BullMQ job.
   - Worker writes the scoped Hyperframes workspace manifest.
   - Postgres status transitions to ready via the worker path.
   - No secrets are emitted in errors/logs/manifests.
8. Keep changes scoped. If the smoke exposes small runtime gaps, fix them with
   focused tests first where practical.
9. Update ROADMAP.md and dev-log/ with what was verified, blockers, and the
   recommended next action.

Important:
- The product target is a browser-based SaaS, not a desktop or mobile app.
- Users should see progress in the eventual web dashboard through API status
  reads from Postgres. Postgres is internal operator infrastructure.
- The next build phase after this smoke is replacing the mock worker path with
  real worker asset download, Hyperframes execution, FFmpeg MP4 generation,
  output upload, and output manifest persistence.
```
