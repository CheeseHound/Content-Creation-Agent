# Transcript Persistence Progress

Date: 2026-05-28

## Current Goal

Continue the post-five-unit implementation pass by moving transcript segments
from request-only planning input into a durable API surface.

## Completed

- Added `content_ops.transcript.v1` transcript records.
- Added `POST /api/transcripts`.
- Added idempotent Postgres transcript persistence and latest-transcript
  lookup by workspace, project, and source asset.
- Added transcript count and segment count to the internal admin analytics
  summary.
- Added sanitized `source_transcribed` product analytics emission after
  transcript persistence.

## Changed Files

- `apps/api/db/migrations/001_initial_content_ops.sql`
- `apps/api/src/transcripts/*`
- `apps/api/src/server.ts`
- `apps/api/src/analytics/*`
- `apps/api/src/admin/analytics/*`
- `apps/api/tests/transcripts.test.ts`
- `apps/api/tests/postgres-transcript-repository.test.ts`
- `apps/api/tests/postgres-admin-analytics-repository.test.ts`

## Verification

- `npm run test:api` passed: 103/103 after this unit.

## Known Blockers

- OpenAI transcription execution is still not wired to this persistence route.
- Transcript records intentionally store segment text; downstream analytics and
  planning outputs must continue to avoid raw transcript text.

## Recommended Next Action

Connect stored transcripts to decision list planning and keep raw transcript
text out of analytics, worker payloads, and decision list output.
