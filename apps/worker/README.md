# Content Ops Render Worker

Phase 3 worker scaffold for the `content-ops-render` BullMQ queue.

The worker supports two modes:

- `CONTENT_OPS_WORKER_MODE=mock` validates the payload, claims the matching
  Postgres render job, writes a scoped workspace manifest, and marks the job
  ready with an empty output manifest.
- `CONTENT_OPS_WORKER_MODE=real` downloads source assets through the worker
  storage boundary, writes a real workspace manifest, invokes the Hyperframes
  render command boundary, uploads generated MP4 outputs, and persists
  `render_jobs.output_manifest` only after upload succeeds.

The first real-render slice includes local filesystem storage for deterministic
tests and smoke runs plus an opt-in S3-compatible worker storage adapter for
Cloudflare R2/AWS-style object download and upload. Queue payloads continue to
carry storage keys only; worker runtime credentials come from environment
configuration.

Runtime assumptions:

- Node.js worker process
- Redis/BullMQ queue named `content-ops-render`
- Postgres render job status persistence
- Puppeteer-compatible browser automation boundary
- Headless Chrome/Chromium available at `CHROME_EXECUTABLE_PATH`
- FFmpeg available at `FFMPEG_PATH`
- Hyperframes CLI available through `HYPERFRAMES_COMMAND`

Required environment:

- `DATABASE_URL`
- `REDIS_URL`

Optional environment:

- `CONTENT_OPS_WORKER_MODE` defaults to `mock`; set `real` to use the
  download/render/upload path
- `CONTENT_OPS_WORKER_WORKSPACE_ROOT` defaults to `.content-ops-worker`
- `CONTENT_OPS_WORKER_STORAGE_MODE` defaults to `local`; set `s3` to use the
  S3-compatible adapter
- `CONTENT_OPS_WORKER_LOCAL_STORAGE_ROOT` defaults to `.content-ops-storage`
- `CHROME_EXECUTABLE_PATH` defaults to `/usr/bin/chromium`
- `PUPPETEER_EXECUTABLE_PATH` is also honored as the Chromium fallback path
- `FFMPEG_PATH` defaults to `/usr/bin/ffmpeg`
- `HYPERFRAMES_COMMAND` defaults to `npx hyperframes`
- `WORKER_CONCURRENCY` defaults to `1`

Required when `CONTENT_OPS_WORKER_STORAGE_MODE=s3`:

- `CONTENT_OPS_STORAGE_BUCKET`
- `CONTENT_OPS_STORAGE_REGION`
- `CONTENT_OPS_STORAGE_ACCESS_KEY_ID`
- `CONTENT_OPS_STORAGE_SECRET_ACCESS_KEY`

Optional S3-compatible storage environment:

- `CONTENT_OPS_STORAGE_ENDPOINT` for R2 or other S3-compatible endpoints
- `CONTENT_OPS_STORAGE_FORCE_PATH_STYLE` can be `true` or `false`; endpoints
  default to path-style addressing
