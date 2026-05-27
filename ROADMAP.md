# Shortform Content Ops SaaS Roadmap

Last updated: 2026-05-27

## Product Direction

Build a subscription SaaS for turning long-form media into short-form content
operations: upload/import video, transcribe it, identify clip opportunities,
render vertical clips with overlays, store outputs, and gate usage by Stripe
subscription tier.

After upload, users should be able to describe the edit they want in a focused
edit brief chat: desired tone, pacing, platforms, moments to include, moments to
exclude, caption style, crop style, music mood, and other creative constraints.
That chat is not the runtime orchestrator. It converts natural-language intent
into a validated structured edit brief that deterministic workers use for clip
scoring, edit planning, quality checks, and rendering.

The original workflow remains the source of truth. Content-specific editing
styles are handled by a content style intelligence layer that adapts analysis,
clip ranking, titles, captions, overlays, and dashboard suggestions by creator
niche without making the runtime depend on an agent skill file.

LangGraph and LangChain are intentionally out of scope for the core product
architecture. The production backbone should remain a custom Postgres-backed
state machine with BullMQ workers, durable artifacts, and explicit retries.
Hyperframes is the composition/rendering layer, not the editing-quality brain.

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
- Edit intent: Website edit brief chat that produces a structured, versioned
  edit brief contract for workers.
- Orchestration: Custom Postgres state machine plus BullMQ worker queues. Do
  not introduce LangGraph or LangChain for the core job lifecycle.
- Billing: Stripe subscriptions and webhooks
- Observability and analytics: provider-native Postgres monitoring for
  database health, app-level operational dashboards for render/queue failures,
  product analytics events for funnel analysis, and internal admin read models
  for support and business reporting.

## Current State

- Local shortform content agent exists under `src/llm/content_ops/`.
- Existing workflow can parse transcripts, rank clip candidates, generate
  captions/hooks/calendar items, plan Hyperframes layout render jobs, and
  support OpenAI transcription through a CLI.
- Product architecture now includes a content style intelligence layer for
  vlogs, gaming and stream clips, tutorials and product demos, podcasts and
  talking-head commentary, and fitness/health/wellness content.
- Product direction now includes an edit brief chat after upload. The chat
  should turn user requests like "make it funny and fast-paced, keep the demo,
  remove the rambling intro" into a structured settings contract that drives
  scoring, edit planning, QC, and rendering.
- The API now has a deterministic edit brief contract behind
  `POST /api/edit-briefs`. If the user leaves the chat box empty, the contract
  applies default tweakable settings for goal, tone, pacing, platforms, clip
  length, caption style, crop strategy, music, and editorial rules.
- `POST /api/edit-briefs` now also accepts a nonblank `chatMessage` and maps
  common editing language into structured settings without making workers
  depend on raw prompt text.
- Render job payloads can now carry an optional structured `edit_brief` object
  with the active brief version and settings for downstream clip scoring and
  render planning.
- Render-job creation now automatically looks up the active persisted edit
  brief for the workspace/project/source asset when callers omit `editBrief`,
  while preserving explicit structured `editBrief` overrides.
- The first edit planning contract now exists under `apps/api/src/edit-planning`
  and turns clip candidates plus `content_ops.edit_brief.v1` settings into a
  deterministic `content_ops.edit_decision_list.v1` decision list.
- Architecture decision: keep the custom state-machine and queue-worker design;
  do not use LangGraph or LangChain as the core orchestrator.
- Production SaaS contract has been started in
  `src/llm/content_ops/platform.py`.
- Architecture notes live in
  `docs/business/shortform-content-ops-saas.md`.
- Cross-chat continuity protocol lives in `DEVLOGS.md`.
- Dev handoffs should be saved in `dev-log/`, and this roadmap should be
  refreshed whenever a next-chat handoff prompt is written.
- First dated handoff prompt has been saved at
  `dev-log/2026-05-21-next-chat-prompt.md`.
- Latest next-chat handoff for the real-render smoke and worker storage
  adapter is saved at
  `dev-log/2026-05-25-next-chat-real-render-smoke-and-storage.md`.
- Latest worker storage progress is saved at
  `dev-log/2026-05-25-worker-s3-storage-progress.md`.
- Latest edit brief contract progress is saved at
  `dev-log/2026-05-26-edit-brief-contract-progress.md`.
- Latest edit brief chat/render wiring progress is saved at
  `dev-log/2026-05-26-edit-brief-chat-render-wiring-progress.md`.
- Latest next-chat handoff for active edit brief lookup and planning contract
  work is saved at
  `dev-log/2026-05-27-next-chat-active-edit-brief-lookup.md`.
- Latest active edit brief lookup and planning contract progress is saved at
  `dev-log/2026-05-27-active-edit-brief-lookup-planning-progress.md`.
- Latest observability health/readiness and analytics contract progress is
  saved at
  `dev-log/2026-05-27-observability-health-analytics-progress.md`.
- Latest admin analytics read model progress is saved at
  `dev-log/2026-05-27-admin-analytics-read-model-progress.md`.
- Latest operator observability runbook progress is saved at
  `dev-log/2026-05-27-operator-observability-runbook-progress.md`.
- Latest API product analytics event wiring progress is saved at
  `dev-log/2026-05-27-product-analytics-api-events-progress.md`.
- Latest PostHog product analytics sink progress is saved at
  `dev-log/2026-05-27-product-analytics-posthog-sink-progress.md`.
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
- The worker now has an opt-in first real render slice:
  `CONTENT_OPS_WORKER_MODE=real` downloads source assets through a storage
  boundary, invokes a Hyperframes render runner boundary, uploads generated
  MP4 outputs through storage, and persists `render_jobs.output_manifest` only
  after upload succeeds. Local filesystem storage supports no-paid-service
  tests and smoke runs, and the opt-in S3-compatible worker adapter downloads
  and uploads objects using worker runtime credentials.
- Observability, database monitoring, and analytics are now the next roadmap
  priority before further product-surface expansion, so the SaaS can be
  operated, debugged, and measured safely as features are added.
- The API now exposes `GET /healthz` and `GET /readyz`; readiness aggregates
  sanitized Postgres, BullMQ queue, and storage-configuration health without
  exposing credentials or dependency URLs.
- A Postgres observability repository now reports connection health,
  migration state, core table availability, and approximate core table row
  counts for operator readiness checks.
- A product analytics event contract now defines the initial funnel event names
  and filters analytics metadata so raw prompts, raw transcripts, storage
  keys, credentials, and raw customer media fields are not sent to sinks.
- The API now has a protected internal admin analytics summary endpoint behind
  `CONTENT_OPS_ADMIN_TOKEN`. `GET /internal/admin/analytics/summary` returns
  bounded aggregate read models for workspace usage, uploads, edit brief and
  decision list activity, render status/failures, and usage minutes without
  raw database dumps, signed URLs, or storage keys.
- Operator-facing Phase 4 runbook documentation now lives at
  `docs/business/shortform-content-ops-operator-runbook.md` and documents the
  health endpoints, admin analytics summary, reserved product funnel events,
  signal ownership, alert candidates, and secret/data handling rules.

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
- Add stable JSON schema for `content_ops.edit_brief.v1` with defaultable user
  intent settings that can be produced by chat or adjusted manually.
- Extend `content_ops.render_job.v1` so workers can receive the active
  structured edit brief settings without raw chat text or credentials.
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
- Add `POST /api/edit-briefs` with request validation, deterministic default
  settings for empty chat intent, structured edit brief normalization, and
  append-only version creation.
- Add deterministic chat-message extraction for common tone, pacing, platform,
  include/exclude, clip-length, caption, crop, and music language.
- Add optional structured edit brief settings to render-job validation and
  worker queue payloads.
- Add active edit brief lookup during render-job creation, with explicit
  request-level `editBrief` overrides preserved and invalid persisted settings
  rejected before enqueue.
- Add `edit_briefs` and `edit_brief_versions` persistence with active-version
  tracking and idempotent version writes.
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
- Worker-side render storage interface with a local filesystem implementation
  for deterministic source downloads and output uploads in tests/smokes.
- First real worker render path behind `CONTENT_OPS_WORKER_MODE=real` that
  downloads source assets, writes a scoped Hyperframes workspace manifest,
  invokes the render runner boundary, uploads MP4 outputs, and persists a real
  output manifest only after upload succeeds.
- S3-compatible worker storage adapter behind
  `CONTENT_OPS_WORKER_STORAGE_MODE=s3` for Cloudflare R2/AWS-style object
  download/upload using worker runtime credentials.
- Fixture Hyperframes command-runner smoke test that executes the configured
  command boundary and discovers generated MP4 outputs.

Remaining:

- Local headless browser smoke path for executing frame-by-frame rendering
  tests against representative Hyperframes templates.
- Live local real-render smoke through Redis/Postgres plus local fake storage.
- Live R2/S3-compatible worker storage smoke against configured object storage.
- Usage ledger finalization when real MP4 rendering starts producing billable
  output minutes.

Acceptance:

- API can enqueue work.
- Worker can consume work.
- Worker can stage raw source assets and template inputs for a browser-rendered
  canvas composition.
- Failed jobs are marked with safe error messages.
- Retried jobs do not double-count usage.

## Phase 4: Observability, Admin Analytics, And Database Monitoring

Status: In progress

Completed:

- Safe operational health endpoints:
  - `GET /healthz` for process liveness without dependency details.
  - `GET /readyz` for dependency readiness across Postgres, Redis/queue, and
    storage configuration without exposing credentials.
- Postgres health repository that reports sanitized database status:
  connection check, migration state, table availability, approximate row
  counts for core tables.
- Product analytics event contract for funnel tracking:
  `upload_presigned`, `source_uploaded`, `edit_brief_created`,
  `decision_list_created`, `render_job_created`, `render_started`,
  `render_ready`, `render_failed`, `output_downloaded`, `checkout_started`,
  and `subscription_updated`.
- Provider-agnostic analytics sink boundary with safe metadata filtering so
  prompts, transcripts, credentials, storage keys, and raw customer media data
  are not sent to analytics sinks.
- No-op/local product analytics sink wired into runtime dependencies.
- Existing API flows now emit sanitized product analytics events after
  successful work:
  - `upload_presigned` after media asset persistence.
  - `edit_brief_created` after edit brief version persistence.
  - `render_job_created` after render job persistence and queue enqueue.
- PostHog-compatible product analytics sink behind `PRODUCT_ANALYTICS_SINK`,
  `POSTHOG_API_KEY`, and optional `POSTHOG_HOST` configuration.
- Internal admin analytics read models over Postgres:
  upload volume, edit brief creation, render job status counts, render success
  rate, failure code distribution, queue latency, render duration, storage
  output counts, and usage by workspace/subscription tier.
- SQL views or stable repository queries for:
  - workspace usage summary
  - render funnel summary
  - render failure summary
  - edit brief and decision list activity
  - usage ledger summary
- Internal admin API surface protected behind a dedicated admin authorization
  boundary:
  - no raw database dumps
  - no customer secrets
  - no signed storage URLs
  - bounded date ranges and workspace filters.

Remaining:

- Admin analytics read model follow-ups:
  - queue latency
  - render duration from persisted worker timestamps
  - storage output counts from output manifests
  - billing and usage ledger reconciliation
- Additional product analytics events from future worker/billing callbacks:
  `source_uploaded`, `render_started`, `render_ready`, `render_failed`,
  `output_downloaded`, `checkout_started`, and `subscription_updated`.
- Slow-query and index guidance hooks where the Postgres provider exposes
  them.
- Support-specific audited actions for any future signed storage URL access.
- Implement alerting thresholds and provider integrations described in the
  operator runbook.

Acceptance:

- An operator can answer "is the system healthy?" without direct database
  access.
- An operator can answer "where are users dropping off?" from product events.
- A support/admin user can inspect workspace/job state through bounded,
  sanitized read models instead of ad hoc SQL.
- Alerts catch queue, render, storage, transcription, billing, and database
  degradation before users report widespread failures.
- Analytics never include raw prompts, raw transcripts, storage credentials,
  database URLs, API keys, or customer media contents.

## Phase 5: Storage And Transcription Integration

Status: Planned

Build:

- R2/S3 signed upload and signed download support.
- Worker download/upload helpers for raw source assets, Hyperframes workspace
  assets, and rendered outputs.
- Live object-storage smoke coverage for API signed uploads/downloads and
  worker S3-compatible direct object transfer.
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

## Phase 6: Edit Brief And Content Style Intelligence

Status: In progress

Build:

- Edit brief contract for user intent, including goal, tone, pacing, target
  platforms, include/exclude constraints, clip length range, caption style, crop
  strategy, music mood, and editorial rules. Initial backend contract
  implemented for API intake and schema validation.
- Default settings path for an empty chat box so users can immediately tweak or
  keep defaults before clip scoring starts. Initial backend defaults
  implemented.
- `edit_briefs` and `edit_brief_versions` persistence so user revisions can
  rerun scoring and planning without re-uploading or re-transcribing source
  media. Initial append-only versioning implemented.
- Initial `edit_decision_lists` persistence table for downstream clip planning
  output. `edit_constraints` remains pending.
- Initial pure edit planning function that maps transcript/clip candidates and
  active edit brief settings into deterministic include/exclude/ranking hints.
- Website chat endpoint that converts user messages into structured edit brief
  settings with schema validation and safe fallbacks. Initial deterministic
  extraction implemented in `POST /api/edit-briefs`; richer LLM-backed
  extraction remains behind the same schema.
- Manual settings panel that exposes the extracted brief for review and edits
  before workers generate clips.
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
- Clip scoring that combines transcript alignment, visual/audio signals,
  content profile rules, and the active edit brief instead of relying on
  Hyperframes for editing quality. Initial render payload wiring and a narrow
  edit decision list planner are implemented; full scoring is still pending.
- QC rules for bad crops, missing captions, clipped words, dead air, black
  frames, frozen frames, unreadable captions, and audio drift before final
  render.
- Health and wellness guardrails that flag risky or unsupported claims instead
  of producing definitive medical advice.

Acceptance:

- A user can describe the edit they want in chat and receive a validated,
  editable settings contract.
- Editing brief revisions create new versions and can rerun clip scoring
  without duplicating uploads or transcription work.
- A transcribed project produces ranked clip candidates with visible reasons.
- Users can override the detected content profile before rendering.
- Dashboard suggestions are stored and returned separately from render outputs.
- Health-related suggestions use safer educational language and flag risky
  claims for review.

## Phase 7: Rendering Pipeline

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

## Phase 8: Billing And Usage

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

## Phase 9: Frontend MVP

Status: Planned

Build:

- Next.js dashboard scaffold.
- Project list and project detail views.
- Upload flow using signed URLs.
- Post-upload edit brief chat for natural-language editing direction.
- Extracted settings panel for tone, pacing, include/exclude rules, platforms,
  clip length, captions, crop strategy, music mood, and editorial rules.
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

- A user can upload a video, describe the edit they want, review/edit extracted
  settings, review recommended clips and suggestions, start a render, watch
  status, and download output.
- Empty, loading, failed, and quota-exceeded states are handled clearly.

## Current Blockers

- Local Python environment is missing `pytest`.
- Top-level `llm` package import currently requires the `openai` dependency to
  be installed.

## Recommended Next Step

Implement Phase 4 first: operational health endpoints, sanitized database
monitoring read models, admin analytics summaries, a product analytics event
contract, and documentation for where operators view each signal. Keep this
provider-agnostic, credential-safe, and bounded by admin authorization before
expanding more product workflow.

After the observability/admin analytics layer is in place, continue the edit
brief slice by adding persistence/repository support around
`content_ops.edit_decision_list.v1`, then connect transcript-derived clip
candidates to the planner. Keep the core orchestration custom with
Postgres/BullMQ workers and do not introduce LangGraph or LangChain.

Before coding, inspect `DEVLOGS.md`, `ROADMAP.md`, and the latest dated file in
`dev-log/`.
