# Worker S3 Storage Progress

Date: 2026-05-25

## Current Goal

Continue the real Hyperframes worker slice by hardening the local render command
boundary and adding worker-side S3-compatible object storage.

## Completed

- Added `CONTENT_OPS_WORKER_STORAGE_MODE`, defaulting to `local`.
- Added opt-in `CONTENT_OPS_WORKER_STORAGE_MODE=s3` configuration using:
  - `CONTENT_OPS_STORAGE_BUCKET`
  - `CONTENT_OPS_STORAGE_REGION`
  - `CONTENT_OPS_STORAGE_ENDPOINT`
  - `CONTENT_OPS_STORAGE_ACCESS_KEY_ID`
  - `CONTENT_OPS_STORAGE_SECRET_ACCESS_KEY`
  - `CONTENT_OPS_STORAGE_FORCE_PATH_STYLE`
- Added `S3CompatibleRenderStorage` for direct signed `GET`/`PUT` object
  transfer using worker runtime credentials. Queue payloads still carry storage
  keys only.
- Wired `apps/worker/src/index.ts` to choose local filesystem or S3-compatible
  storage from runtime config.
- Added a fixture Hyperframes command-runner smoke test that executes the
  configured command boundary and verifies MP4 output discovery.
- Updated `apps/worker/README.md` and `ROADMAP.md`.

## Changed Files

- `apps/worker/src/render-storage.ts`
- `apps/worker/src/config.ts`
- `apps/worker/src/index.ts`
- `apps/worker/tests/render-storage.test.ts`
- `apps/worker/tests/real-hyperframes-worker.test.ts`
- `apps/worker/tests/config.test.ts`
- `apps/worker/README.md`
- `ROADMAP.md`

## Verification

- `npm run test:worker` passed: 23/23.
- `npm run test:api` passed: 44/44.
- `git diff --check` passed.

## Blockers

- Live queue-backed real-render smoke was not run because local Redis and
  Postgres were not reachable:
  - `redis-cli ping` returned connection refused on `127.0.0.1:6379`.
  - `pg_isready` returned no response on `/tmp:5432`.
  - `brew services list` showed both `redis` and `postgresql@16` stopped.
- No live R2/S3-compatible storage smoke has been run yet.
- The real Hyperframes CLI contract is still unverified beyond the fixture
  command boundary.

## Recommended Next Action

Start local Redis/Postgres, then run the queue-backed
`CONTENT_OPS_WORKER_MODE=real` smoke with `CONTENT_OPS_WORKER_STORAGE_MODE=local`
and a local `HYPERFRAMES_COMMAND` shim. After that passes, run a live
R2/S3-compatible smoke with worker runtime credentials and no credentials in
queue payloads.
