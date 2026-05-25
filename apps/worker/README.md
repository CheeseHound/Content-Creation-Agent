# Content Ops Render Worker

Phase 3 worker scaffold for the `content-ops-render` BullMQ queue.

The current worker runs the mock Hyperframes path only. It validates the
`content_ops.render_job.v1` payload, claims the matching Postgres render job,
creates a workspace/project-scoped local composition directory, stages source
asset references, writes a render workspace manifest, and marks the job ready
with an empty output manifest. It does not run full MP4 rendering yet.

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

- `CONTENT_OPS_WORKER_WORKSPACE_ROOT` defaults to `.content-ops-worker`
- `CHROME_EXECUTABLE_PATH` defaults to `/usr/bin/chromium`
- `PUPPETEER_EXECUTABLE_PATH` is also honored as the Chromium fallback path
- `FFMPEG_PATH` defaults to `/usr/bin/ffmpeg`
- `HYPERFRAMES_COMMAND` defaults to `npx hyperframes`
- `WORKER_CONCURRENCY` defaults to `1`
