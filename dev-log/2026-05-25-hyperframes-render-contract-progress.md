# Hyperframes Render Contract Progress

Date: 2026-05-25

## Current Goal

Shift the shortform content ops render contract from raw FFmpeg-oriented render
metadata to Hyperframes-ready HTML-in-Canvas composition payloads while keeping
the existing SaaS architecture intact.

## Architecture Decisions

- Keep Next.js, Fastify/NestJS-compatible API boundaries, Postgres usage
  ledger, BullMQ, and direct Cloudflare R2/S3-compatible presigned uploads.
- Do not modify ingestion, transcription, or analytical layers in this slice.
- Treat the queue payload as a declarative Hyperframes render intent:
  template variant, template parameters, style options, caption timeline,
  source asset storage keys, composition defaults, and MP4 output settings.
- Keep queue payloads secret-free. Storage keys are allowed; storage
  credentials are not.
- Include a deterministic render intent fingerprint in idempotency and render
  job IDs so style/template/caption changes do not collide.

## Changed Files

- `ROADMAP.md`
- `schemas/content-ops-render-job-v1.schema.json`
- `apps/api/src/render-jobs/types.ts`
- `apps/api/src/render-jobs/validation.ts`
- `apps/api/src/render-jobs/contract.ts`
- `apps/api/src/render-jobs/service.ts`
- `apps/api/tests/render-jobs.test.ts`
- `apps/api/tests/render-job-schema.test.ts`
- `apps/api/tests/bullmq-render-queue.test.ts`
- `apps/api/tests/postgres-repository.test.ts`
- `src/llm/content_ops/platform.py`
- `tests/test_shortform_platform.py`

## Verification

- `npm run test:api` passes: 41 passed, 0 failed.
- `npm test` passes: 2,568 passed, 0 failed.
- `git diff --check` passes.
- `python3 -m py_compile src/llm/content_ops/platform.py tests/test_shortform_platform.py` passes.

## Known Blockers

- Local Python environment is still missing `pytest`, so
  `python3 -m pytest tests/test_shortform_platform.py` could not run.
- Top-level `llm` imports still require `openai` to be installed for normal
  package import paths.
- The Postgres, Redis, and R2/S3-compatible runtime smoke paths still have not
  been exercised against live local services.

## Recommended Next Action

Build the Phase 3 worker scaffold around the new Hyperframes queue payload:
create a Node/Puppeteer worker container shape with headless Chrome/Chromium,
FFmpeg, and Hyperframes CLI assumptions; consume `content-ops-render` jobs;
stage source video assets into a workspace/project-scoped local composition
directory; and add a mock worker path that validates browser-renderable
template inputs before full MP4 rendering is implemented.
