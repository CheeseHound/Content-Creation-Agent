# Backend API MVP Progress

Date: 2026-05-21

## Current Goal

Build the first tested backend API slice for the shortform content ops SaaS:
`POST /api/render-jobs`.

## Architecture Decisions

- Ported the render-job workflow contract into TypeScript for `apps/api` so the
  backend owns request validation, entitlement checks, idempotency keys, storage
  keys, and queue payload shape at the API boundary.
- Kept the scaffold dependency-free for now, using Node HTTP plus pure route
  handlers. The route/service split should still be easy to wrap with Fastify
  or NestJS later.
- Queue payloads include storage keys and render metadata only. No API keys,
  Stripe secrets, or credentials are included.

## Changed Files

- `apps/api/tsconfig.json`
- `apps/api/src/api-response.ts`
- `apps/api/src/index.ts`
- `apps/api/src/server.ts`
- `apps/api/src/render-jobs/contract.ts`
- `apps/api/src/render-jobs/route.ts`
- `apps/api/src/render-jobs/service.ts`
- `apps/api/src/render-jobs/types.ts`
- `apps/api/src/render-jobs/validation.ts`
- `apps/api/tests/render-jobs.test.ts`
- `package.json`
- `ROADMAP.md`

## Verification

- `npm run test:api` passes.
- `npm test` is blocked before repo tests run by existing Unicode safety
  violations in `skills/windows-desktop-e2e/SKILL.md` and
  `docs/ja-JP/skills/windows-desktop-e2e/SKILL.md`.
- `npm ci --cache /private/tmp/codex-npm-cache` was needed because the default
  npm cache under `/Users/willis/.npm` had permission errors.

## Known Blockers

- Local Python environment is still missing `pytest`.
- Top-level `llm` imports still require `openai` to be installed.
- Full Node test suite is blocked by the Unicode safety violations listed
  above.
- The API currently uses in-memory test/scaffold adapters, not Postgres or
  BullMQ.

## Recommended Next Action

Add a stable JSON schema for `content_ops.render_job.v1`, then wire
`apps/api` to durable render-job persistence and a real queue adapter. After
that, add `GET /api/render-jobs/:id` and initial Postgres migrations.
