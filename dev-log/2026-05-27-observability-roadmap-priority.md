# Observability Roadmap Priority

Date: 2026-05-27

## Current Goal

Make database monitoring, operational observability, and admin analytics the
next implementation priority in the roadmap before continuing broader product
workflow expansion.

## Completed

- Added observability and analytics to the architecture target.
- Added Phase 4: Observability, Admin Analytics, And Database Monitoring.
- Moved storage/transcription, edit intelligence, rendering, billing, and
  frontend phases down by one phase number.
- Updated the recommended next step to implement Phase 4 first.

## Changed Files

- `ROADMAP.md`
- `dev-log/2026-05-27-observability-roadmap-priority.md`

## Verification

- Documentation-only roadmap update.
- `git diff --check` passed.

## Known Blockers

- No observability code has been implemented yet.
- Admin authorization boundary still needs to be designed before exposing
  support or analytics endpoints.
- Provider choices remain flexible: Postgres provider dashboard, Grafana or
  Datadog, PostHog, and Metabase or Retool are planned integration targets,
  not hard dependencies yet.

## Recommended Next Action

Implement Phase 4 first: health/readiness endpoints, database monitoring
repository, internal admin analytics summaries, product analytics event
contract, analytics sink boundary, and operator documentation.
