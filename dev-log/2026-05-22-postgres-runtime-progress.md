# Postgres Runtime Progress

Date: 2026-05-22

## Current Goal

Continue the backend MVP by moving `apps/api` from an in-memory runtime toward
production Postgres wiring.

## Changes

- Added `apps/api/src/config.ts` for `DATABASE_URL`, `PORT`, and
  `RUN_DB_MIGRATIONS` validation without echoing secret connection strings.
- Added `apps/api/src/db/postgres-client.ts` using a `pg` pool behind the
  existing query-client interface.
- Added `apps/api/src/db/migrations.ts` to load SQL migrations, create
  `schema_migrations`, apply pending migrations in filename order, record
  SHA-256 checksums, roll back failed migrations, and reject checksum drift.
- Updated `apps/api/src/index.ts` and `apps/api/src/server.ts` so startup uses
  Postgres dependencies and runs migrations by default. The queue dependency is
  still in-memory until the Redis/BullMQ adapter lands.
- Added focused tests in `apps/api/tests/config.test.ts` and
  `apps/api/tests/migration-runner.test.ts`.
- Added `pg` and `@types/pg` to `package.json`, `package-lock.json`, and
  `yarn.lock`.
- Documented the new API environment variables in `.env.example`, refreshed
  `ROADMAP.md`, and noted the Postgres runtime status in
  `docs/business/shortform-content-ops-saas.md`.

## Verification

- `npm run test:api` passes: 20 passed, 0 failed.
- `npm test` passed after the implementation: 2,568 passed, 0 failed.
- After correcting `yarn.lock` back to Yarn 4 format, `npm run test:api` still
  passed and `node scripts/ci/scan-supply-chain-iocs.js` passed with 242 files
  inspected.

## Known Blockers

- Local Python environment is still missing `pytest`.
- Top-level `llm` imports still require `openai` to be installed.
- The Postgres runtime path has not yet been exercised against a live local
  database in this session.

## Recommended Next Action

Add the Redis/BullMQ queue adapter for `content-ops-render`, replacing the
current in-memory queue used by the Postgres runtime path. Then implement
`POST /api/uploads/presign` for direct R2/S3-compatible source uploads.
