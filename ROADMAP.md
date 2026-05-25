# Shortform Content Ops SaaS Roadmap

Last updated: 2026-05-25

## Product Direction

Build a subscription SaaS for turning long-form media into short-form content
operations: upload/import video, transcribe it, identify clip opportunities,
render vertical clips with overlays, store outputs, and gate usage by Stripe
subscription tier.

The original workflow remains the source of truth. Content-specific editing
styles are handled by a content style intelligence layer that adapts analysis,
clip ranking, titles, captions, overlays, and dashboard suggestions by creator
niche without making the runtime depend on an agent skill file.

## Architecture Target

- Frontend: Next.js App Router with React and TypeScript
- Backend: Node API service, preferably Fastify or NestJS
- Database: Postgres
- Object storage: Cloudflare R2 by default, S3-compatible by contract
- Queue: Redis and BullMQ by default, SQS-compatible at the boundary
- Workers: Containerized Node/Puppeteer environment running headless
  Chrome/Chromium, bundled with FFmpeg for Hyperframes frame-to-MP4
  compilation.
- Transcription: OpenAI audio transcription API
- Billing: Stripe subscriptions and webhooks

## Current State

- Local shortform content agent exists under `src/llm/content_ops/`.
- Existing workflow can parse transcripts, rank clip candidates, generate
  captions/hooks/calendar items, plan Hyperframes layout render jobs, and
  support OpenAI transcription through a CLI.
- Product architecture now includes a content style intelligence layer for
  vlogs, gaming and stream clips, tutorials and product demos, podcasts and
  talking-head commentary, and fitness/health/wellness content.
- Production SaaS contract has been started in
  `src/llm/content_ops/platform.py`.
- Architecture notes live in
  `docs/business/shortform-content-ops-saas.md`.
- Cross-chat continuity protocol lives in `DEVLOGS.md`.
- Dev handoffs should be saved in `dev-log/`, and this roadmap should be
  refreshed whenever a next-chat handoff prompt is written.
- First dated handoff prompt has been saved at
  `dev-log/2026-05-21-next-chat-prompt.md`.
- Latest next-chat handoff for the worker smoke test is saved at
  `dev-log/2026-05-25-next-chat-hyperframes-worker-smoke.md`.
- Local API-to-worker Hyperframes smoke results are saved at
  `dev-log/2026-05-25-hyperframes-api-worker-smoke-results.md`.
- Backend API MVP has started under `apps/api` with a TypeScript render-job
  contract for Hyperframes-ready layout payloads, pure
  `POST /api/render-jobs` handler, Node HTTP scaffold, and focused tests.
- The worker queue payload is now pinned by
  `schemas/content-ops-render-job-v1.schema.json` as the contract that will
  carry reusable HTML/CSS template variants, template input parameters, and
  structured JSON caption timelines into the worker.
- The TypeScript API contract now validates and enqueues Hyperframes payloads
  with template variants, safe template parameters, style options, structured
  caption timelines, source asset storage keys, composition defaults, and output
  settings.
- `apps/api` now includes `GET /api/render-jobs/:id`, a generic Postgres
  repository boundary, and an initial content-ops SQL migration.
- API startup now validates `DATABASE_URL`, creates a real `pg` pool-backed
  Postgres repository, and runs SQL migrations through a checksum-tracked
  `schema_migrations` table by default.
- API Postgres client now handles `pg` multi-statement migration results so
  the initial SQL migration can run against an empty live Postgres database.
- API startup now validates `REDIS_URL` and dispatches accepted render jobs to
  BullMQ on the `content-ops-render` queue.
- API startup now validates R2/S3-compatible storage settings for signed source
  uploads.
- API startup now validates Stripe billing secrets and OpenAI transcription
  settings without echoing secret values in errors.
- `POST /api/uploads/presign` now validates upload metadata, gates source size
  by subscription tier, stores source assets in `media_assets`, and returns a
  short-lived signed PUT target without exposing storage credentials.
- `GET /api/render-jobs/:id` now returns signed output download URLs for ready
  jobs with persisted output manifests, while refusing to sign output keys
  outside the job's render output prefix.
- Full `npm test` passes as of 2026-05-25 after adding the Hyperframes worker
  scaffold.
- Phase 3 worker scaffolding now lives under `apps/worker` with a
  standalone TypeScript package shape, BullMQ consumer boundary,
  Postgres-backed render status repository, mock Hyperframes workspace
  staging, and container runtime assumptions for Puppeteer-compatible
  Chromium, FFmpeg, and the Hyperframes CLI.
- First local API-to-worker smoke passed with Homebrew Redis/Postgres: API
  accepted and enqueued Hyperframes jobs, the worker consumed them, wrote
  scoped workspace manifests under `/tmp/content-ops-worker-smoke`, and
  advanced Postgres status from `render_queued` to `rendering` to `ready`
  without leaking configured dummy secrets.

## Phase 1: Domain And Workflow Contract

Status: In progress

Completed:

- Define subscription tiers and render entitlements.
- Define render job lifecycle states and allowed transitions.
- Define deterministic R2/S3 storage key layout.
- Define BullMQ-ready queue payload shape for Hyperframes layout rendering.
- Add stable JSON schema for `content_ops.render_job.v1` to prepare render
  jobs for HTML canvas composition instead of low-level FFmpeg filter
  matrices.
- Add reusable HTML/CSS template variants, template input parameters,
  structured JSON caption timelines, source asset references, and Hyperframes
  output settings to `schemas/content-ops-render-job-v1.schema.json`.
- Add tests for quota gates, queue payloads, storage keys, and state
  transitions.

Remaining:

- Keep the Python contract and TypeScript API contract aligned until a shared
  schema package exists.
- Add generated type/schema drift checks now that the worker package exists.

## Phase 2: Backend API MVP

Status: In progress

Completed:

- Add `apps/api` TypeScript service scaffold.
- Add a consistent API response envelope helper.
- Port the render-job entitlement, storage-key, idempotency, and
  Hyperframes-oriented queue payload contract into TypeScript for the API
  boundary.
- Add `POST /api/render-jobs` handler with request validation, subscription
  quota checks, render job modeling, and enqueue boundary.
- Add focused Node tests for accepted render jobs, quota rejection before
  enqueue, and validation errors.
- Add `GET /api/render-jobs/:id` handler for render job readback.
- Add a generic Postgres render-job repository boundary with idempotent insert
  behavior.
- Add the initial SQL migration for workspaces, users, memberships,
  subscriptions, projects, media assets, render jobs, usage ledger, and webhook
  event idempotency.
- Add `DATABASE_URL`/`PORT`/`RUN_DB_MIGRATIONS` config validation.
- Wire runtime startup to a real Postgres client and migration runner with
  checksum drift protection.
- Add `REDIS_URL` config validation and a BullMQ producer for
  `content-ops-render`.
- Add storage config validation for R2/S3-compatible signed uploads.
- Add Stripe and OpenAI transcription config validation.
- Add `POST /api/uploads/presign` with request validation, plan upload-size
  checks, deterministic source object keys, media asset persistence, and a
  signed PUT upload target.
- Add signed download/output URL support for completed render jobs.
- Add API-side Hyperframes render-job validation so template variants, styling
  parameters, source asset references, and structured caption timelines pass
  through to the worker without exposing secrets.
- Exercise the initial migration against a fresh live Postgres database and
  fix the `pg` multi-statement result normalization issue found during smoke.

Remaining:

- Live R2/S3-compatible signed upload smoke test.

Acceptance:

- Render jobs are rejected before enqueueing when subscription quota is
  exceeded.
- Accepted render jobs produce an idempotent Hyperframes queue payload without
  secrets.
- Job status transitions are validated server-side.

## Phase 3: Queue And Worker MVP

Status: In progress

Completed:

- Redis/BullMQ queue named `content-ops-render`.
- Worker container scaffold for Node, Puppeteer-compatible Chromium, FFmpeg,
  and the Hyperframes CLI.
- Mock worker path that consumes a job and advances status from
  `render_queued` to `rendering` to `ready`.
- Mock worker flow that stages raw source asset references into a
  workspace/project-scoped Hyperframes composition directory and validates the
  render workspace manifest without mutating ingestion or analysis outputs.
- Retry/idempotency behavior for already-ready jobs so repeated worker
  execution does not double-finalize work.
- Progress updates persisted to Postgres.
- Live local API-to-worker smoke through Redis/BullMQ and Postgres, including
  verified `render_queued` to `rendering` to `ready` status transitions and
  mock Hyperframes workspace manifest writing.

Remaining:

- Worker download/upload helpers for pulling source assets and writing final
  render outputs.
- Local headless browser smoke path for executing frame-by-frame rendering
  tests against representative Hyperframes templates.
- Usage ledger finalization when real MP4 rendering starts producing billable
  output minutes.

Acceptance:

- API can enqueue work.
- Worker can consume work.
- Worker can stage raw source assets and template inputs for a browser-rendered
  canvas composition.
- Failed jobs are marked with safe error messages.
- Retried jobs do not double-count usage.

## Phase 4: Storage And Transcription Integration

Status: Planned

Build:

- R2/S3 signed upload and signed download support.
- Worker download/upload helpers for raw source assets, Hyperframes workspace
  assets, and rendered outputs.
- FFmpeg audio extraction in worker runtime.
- OpenAI transcription integration.
- Transcript persistence.
- Integration flow that pulls raw video assets into an HTML canvas composition
  template before rendering tests.
- Local headless browser execution for frame-by-frame template validation in
  the worker runtime.

Acceptance:

- User uploads do not pass through the API server.
- Queue payloads contain storage keys, not storage credentials.
- Transcription failures are recoverable and visible in job status.

## Phase 5: Content Style Intelligence

Status: Planned

Build:

- Content profile contract for `vlog`, `gaming`, `stream_clip`, `tutorial`,
  `product_demo`, `podcast`, `talking_head`, `fitness`, `health`, and
  `news_commentary`.
- Profile detection from transcript, source metadata, audio/scene signals, and
  optional user override.
- Profile-aware clip candidate scoring with reasons, hooks, titles, captions,
  target platform fit, and retention risk notes.
- Dashboard suggestions for edits, overlays, pacing, clip splits, and content
  calendar opportunities.
- Brand/profile settings for tone, caption style, logo, colors, preferred calls
  to action, and blocked phrases.
- Health and wellness guardrails that flag risky or unsupported claims instead
  of producing definitive medical advice.

Acceptance:

- A transcribed project produces ranked clip candidates with visible reasons.
- Users can override the detected content profile before rendering.
- Dashboard suggestions are stored and returned separately from render outputs.
- Health-related suggestions use safer educational language and flag risky
  claims for review.

## Phase 6: Rendering Pipeline

Status: Planned

Build:

- Hyperframes CLI execution inside the worker container.
- Dynamic workspace and project scoping for HTML canvas asset directories,
  including source videos, fonts, brand assets, captions, and generated
  previews.
- Dynamically compiled HTML templates with responsive typography, Flexbox
  caption layouts, kinetic animations through GSAP or Anime.js, and background
  video components.
- Worker execution of `npx hyperframes render --output` to run headless browser
  snapshot capture, compile frames into polished MP4 outputs with bundled
  FFmpeg, and upload final assets back to Cloudflare R2.
- Output manifests stored against each render job with rendered asset keys,
  template variant, template parameters, caption timeline version, thumbnails,
  durations, checksums, and render diagnostics.
- Basic thumbnail or preview image generation from the Hyperframes output
  workspace.

Acceptance:

- A completed job has downloadable final outputs.
- Rendering can fail per clip without losing the whole job history.
- Output paths are scoped by workspace and project.
- Render manifests identify the Hyperframes template, inputs, generated assets,
  and R2 object keys needed for replay or audit.

## Phase 7: Billing And Usage

Status: Planned

Build:

- Stripe Checkout endpoint.
- Stripe customer portal endpoint.
- Stripe webhook handler with event idempotency.
- Subscription state sync.
- Append-only usage ledger.
- Plan-specific render minute and concurrency limits.

Acceptance:

- Stripe webhooks are the source of truth for subscription state.
- Expensive jobs are gated before queueing.
- Usage accounting survives retries and worker restarts.

## Phase 8: Frontend MVP

Status: Planned

Build:

- Next.js dashboard scaffold.
- Project list and project detail views.
- Upload flow using signed URLs.
- Render job creation form.
- Template selection and styling controls for fonts, brand colors, caption
  style, and overlay positioning, passed directly into the Hyperframes payload
  schema.
- Content profile selection and detected-profile review.
- Clip candidate review with scores, reasons, hooks, captions, and platform
  fit.
- Dashboard suggestions for edit strategy, overlays, pacing, and calendar
  opportunities.
- Brand/profile settings for creator-specific output style.
- Job status/progress view.
- Output download view.
- Billing page with checkout and portal actions.

Acceptance:

- A user can upload a video, review recommended clips and suggestions, start a
  render, watch status, and download output.
- Empty, loading, failed, and quota-exceeded states are handled clearly.

## Current Blockers

- Local Python environment is missing `pytest`.
- Top-level `llm` package import currently requires the `openai` dependency to
  be installed.

## Recommended Next Step

Replace the mock worker ready path with the first real render slice: download
source assets into the scoped worker workspace, execute a representative
Hyperframes browser composition locally, run FFmpeg MP4 generation, upload
outputs through the storage boundary, persist a real output manifest, and only
then finalize billable usage.

Before coding, inspect `DEVLOGS.md`, `ROADMAP.md`, and the latest dated file in
`dev-log/`.
