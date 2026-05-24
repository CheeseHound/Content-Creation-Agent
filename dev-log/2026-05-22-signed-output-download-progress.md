# Signed Output Download Progress

Date: 2026-05-22

## Current Goal

Continue the backend API MVP by adding signed output download support for
completed render jobs without requiring live storage credentials during local
unit tests.

## Changes

- Extended render job records with an optional `outputManifest` and added a
  read model that includes signed `outputs`.
- `GET /api/render-jobs/:id` now signs output downloads for `ready` jobs when
  the output manifest lists rendered assets.
- Added a security guard that refuses to sign output keys outside the job's
  `render_output_prefix`.
- Extended the R2/S3-compatible signer with signed `GET` URLs and response
  content-disposition/content-type overrides.
- Added configurable `OUTPUT_DOWNLOAD_TTL_SECONDS` with the same 60-3600 second
  bounds as upload presigns.
- Updated `.env.example`, `ROADMAP.md`, and
  `docs/business/shortform-content-ops-saas.md`.

## Verification

- `npm run test:api` passes: 39 passed, 0 failed.
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
storage target. Exercise upload presigning, a signed PUT upload, render job
enqueueing, and a ready-job readback with a persisted `output_manifest` to
verify signed output downloads against live storage.
