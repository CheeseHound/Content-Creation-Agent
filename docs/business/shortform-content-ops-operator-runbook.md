# Shortform Content Ops Operator Runbook

This runbook covers the first Phase 4 operating surfaces for the shortform
content ops SaaS. It is intentionally provider-agnostic and does not require
direct database access for the first health checks.

## Runtime Readiness

Use `GET /healthz` for process liveness. This endpoint only answers whether the
API process can respond. It does not include dependency details.

Use `GET /readyz` for dependency readiness. This endpoint aggregates:

- Postgres connection health
- applied migration names
- core table availability
- approximate core table row counts
- BullMQ queue counts for waiting, active, delayed, and failed jobs
- storage configuration readiness

The readiness response must not include database URLs, Redis URLs, storage
credentials, API keys, raw prompts, raw transcripts, or customer media data.

## Internal Admin Analytics

Use `GET /internal/admin/analytics/summary` for aggregate support and business
visibility. Requests must include:

```text
Authorization: Bearer {CONTENT_OPS_ADMIN_TOKEN}
```

Supported query parameters:

- `workspaceId`: optional safe workspace identifier filter
- `start`: optional UTC date in `YYYY-MM-DD` format
- `end`: optional UTC date in `YYYY-MM-DD` format

The date window is bounded to 90 days. When dates are omitted, the API returns
the default recent window.

The summary includes aggregate counts only:

- workspace count by subscription tier
- upload count and total uploaded bytes
- edit brief and edit brief version counts
- edit decision list count
- render job counts by status
- render success rate
- render failure-code distribution
- estimated render minutes
- usage-ledger render minutes
- output manifest count and total output bytes

It must not return raw database rows, raw prompts, raw transcripts, signed
storage URLs, storage keys, object payloads, customer secrets, or customer
media contents.

## Product Funnel Events

The product analytics contract currently reserves these funnel events:

- `upload_presigned`
- `source_uploaded`
- `edit_brief_created`
- `decision_list_created`
- `render_job_created`
- `render_started`
- `render_ready`
- `render_failed`
- `output_downloaded`
- `checkout_started`
- `subscription_updated`

Analytics metadata filtering drops prompt, transcript, credential,
token/password/secret, storage key, and raw media-shaped fields before events
reach a sink.

Set `PRODUCT_ANALYTICS_SINK=posthog` to enable the PostHog-compatible
production sink. `POSTHOG_API_KEY` is required in that mode, and `POSTHOG_HOST`
defaults to `https://app.posthog.com` when omitted. Leave
`PRODUCT_ANALYTICS_SINK` unset or set to `none` to use the no-op sink.

## Where Operators Look

Use the API health endpoints first:

- API process liveness: `GET /healthz`
- API dependency readiness: `GET /readyz`
- Support/business aggregates:
  `GET /internal/admin/analytics/summary`

Use provider dashboards for deeper infrastructure signals:

- Database health: Postgres provider dashboard or Performance Insights
- Service and worker metrics: Grafana or Datadog
- Product funnel events: PostHog-compatible sink when
  `PRODUCT_ANALYTICS_SINK=posthog`
- Internal support views: Metabase or Retool once read models stabilize

## Alert Candidates

Initial alert thresholds should cover:

- failed render rate
- queue backlog age
- worker retry spikes
- Postgres connection saturation
- storage upload failures
- Stripe webhook failures
- transcription failures
- usage-ledger reconciliation drift

## Secret And Data Handling

Operators may confirm that these environment settings exist, but must not paste
or log their values:

- `CONTENT_OPS_ADMIN_TOKEN`
- `CONTENT_OPS_STORAGE_SECRET_ACCESS_KEY`
- `CONTENT_OPS_STORAGE_ACCESS_KEY_ID`
- `DATABASE_URL`
- `REDIS_URL`
- `OPENAI_API_KEY`
- `POSTHOG_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

These prohibitions apply to runbooks, analytics events, alert payloads, and
handoff notes:

- No raw prompts
- No raw transcripts
- No signed storage URLs
- No storage credentials
- No customer media contents
