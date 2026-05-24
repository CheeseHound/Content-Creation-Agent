# Upload Presign Progress

Date: 2026-05-22

## Current Goal

Continue the backend API MVP by adding direct source-upload presigning for the
shortform content ops SaaS.

## Changes

- Added `POST /api/uploads/presign` under `apps/api`.
- The endpoint validates upload metadata, accepts supported audio/video MIME
  types, gates source size by subscription tier, creates deterministic
  workspace/project-scoped object keys, stores a `media_assets` row, and returns
  a short-lived signed PUT target.
- Added a Postgres upload repository for subscription reads and media asset
  persistence.
- Added an R2/S3-compatible SigV4 signer built on Node's standard crypto
  module.
- Extended API config validation and `.env.example` with storage bucket,
  endpoint, credentials, region, and upload URL TTL settings.
- Refreshed `ROADMAP.md` and
  `docs/business/shortform-content-ops-saas.md`.

## Verification

- `npm run test:api` passes: 33 passed, 0 failed.
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
