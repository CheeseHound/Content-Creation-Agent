# Transcript Candidate Planning Progress

Date: 2026-05-28

## Current Goal

Connect transcript-derived candidate generation to the edit decision list
planner without introducing raw transcript text into worker payloads or
persisted planning outputs.

## Completed

- Added `buildTranscriptClipCandidates` to derive deterministic candidate IDs,
  normalized transcript snippets, time ranges, and base scores from transcript
  segments.
- Extended `POST /api/edit-decision-lists` so callers can provide exactly one
  input source: validated `candidates` or validated `transcriptSegments`.
- The service now converts transcript segments into candidates before calling
  `buildEditDecisionList`.
- Tests cover deterministic candidate extraction, zero-length segment
  filtering, transcript-segment API input, and unsafe/ambiguous input
  rejection.

## Changed Files

- `apps/api/src/edit-planning/contract.ts`
- `apps/api/src/edit-planning/types.ts`
- `apps/api/src/edit-planning/validation.ts`
- `apps/api/src/edit-planning/service.ts`
- `apps/api/tests/edit-planning.test.ts`
- `apps/api/tests/edit-decision-lists.test.ts`
- `ROADMAP.md`

## Verification

- `npm run test:api` passed: 98/98 after this unit.

## Known Blockers

- Transcript storage and retrieval are still pending; transcript segments are
  currently supplied directly to the planning endpoint.
- Candidate scoring is transcript-only and intentionally narrow; visual/audio
  signals and content profile rules remain pending.

## Recommended Next Action

Add richer content profile detection and candidate scoring over persisted
transcripts/candidates before expanding render planning.
