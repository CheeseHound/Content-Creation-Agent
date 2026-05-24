# External Runtime Config Progress

Date: 2026-05-22

## Current Goal

Continue the backend API MVP by adding fail-fast runtime validation for the
external billing and transcription settings needed by upcoming Stripe and OpenAI
integrations.

## Changes

- Extended `apps/api/src/config.ts` with typed `billing` and `transcription`
  config sections.
- API config now requires `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `OPENAI_API_KEY`, and `OPENAI_TRANSCRIPTION_MODEL`.
- Stripe webhook secrets must use the `whsec_` prefix, and transcription model
  IDs must be machine-safe model identifiers.
- Added config tests that verify missing or malformed external settings fail
  fast without echoing secret values.
- Updated `.env.example`, `ROADMAP.md`, and
  `docs/business/shortform-content-ops-saas.md`.

## Verification

- `npm run test:api` passes: 35 passed, 0 failed.
- `npm test` passes: 2,568 passed, 0 failed.
- `npm audit --omit=dev` passes: 0 vulnerabilities.
- `node scripts/ci/scan-supply-chain-iocs.js` passes: 246 files inspected.

## Known Blockers

- Local Python environment is still missing `pytest`.
- Top-level `llm` imports still require `openai` to be installed.
- The Postgres, Redis, and storage runtime paths have not yet been smoke-tested
  against live local services in this session.

## Recommended Next Action

Run the API against local Postgres, Redis, and an R2/S3-compatible development
storage target, submit a sample upload presign request, upload a small source
asset with the signed PUT URL, then submit a sample render job and verify the
BullMQ job lands in `content-ops-render`.
