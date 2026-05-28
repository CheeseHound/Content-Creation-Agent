# Stored Transcript And Content Profile Progress

Date: 2026-05-28

## Current Goal

Use persisted transcripts for edit decision list planning and add a first
deterministic content-profile scoring signal.

## Completed

- Extended `POST /api/edit-decision-lists` with `useStoredTranscript: true`.
- The decision list service now loads the latest persisted transcript and
  derives deterministic clip candidates before planning.
- Added missing-transcript conflict handling with
  `stored_transcript_required`.
- Added a narrow content profile detector for product demos, tutorials,
  podcasts, gaming, fitness, and general content.
- Added profile-aware score boosts and reasons to edit decisions without
  persisting raw transcript text in decision list outputs.

## Changed Files

- `apps/api/src/edit-planning/contract.ts`
- `apps/api/src/edit-planning/service.ts`
- `apps/api/src/edit-planning/types.ts`
- `apps/api/src/edit-planning/validation.ts`
- `apps/api/src/edit-planning/route.ts`
- `apps/api/tests/edit-planning.test.ts`
- `apps/api/tests/edit-decision-lists.test.ts`

## Verification

- `npm run test:api` passed: 103/103 after this unit.

## Known Blockers

- Content profile override UI/API is still pending.
- Visual/audio scoring signals remain pending.
- Hook, title, caption, platform-fit, and retention-risk scoring remain
  pending.

## Recommended Next Action

Add source metadata and visual/audio signal inputs to candidate scoring, then
expose content profile override before render planning.
