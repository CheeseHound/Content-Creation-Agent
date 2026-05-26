# Edit Brief Chat And Render Wiring Progress

Date: 2026-05-26

## Current Goal

Continue directly from the edit brief contract into the next two sections:
deterministic chat extraction and structured edit brief wiring into render
planning payloads.

## Completed

- Added `chatMessage` support to `POST /api/edit-briefs`.
- Implemented deterministic extraction for common editing language:
  - tone
  - pacing
  - target platforms
  - include/exclude moments
  - clip length range
  - caption style
  - crop strategy
  - music mood
- Preserved the default path for a blank or omitted chat box.
- Kept explicit structured settings as overrides over chat-derived settings.
- Extended render-job intake to accept an optional structured edit brief
  reference.
- Extended `content_ops.render_job.v1` so worker queue payloads can carry
  `render.edit_brief` with active brief version metadata and normalized
  settings.
- Added render-job validation for structured edit brief settings and rejected
  unsafe/secret-shaped text through the render boundary.
- Updated roadmap and architecture notes.

## Changed Files

- `apps/api/src/edit-briefs/contract.ts`
- `apps/api/src/edit-briefs/types.ts`
- `apps/api/src/edit-briefs/validation.ts`
- `apps/api/src/render-jobs/contract.ts`
- `apps/api/src/render-jobs/types.ts`
- `apps/api/src/render-jobs/validation.ts`
- `apps/api/tests/edit-briefs.test.ts`
- `apps/api/tests/render-jobs.test.ts`
- `apps/api/tests/render-job-schema.test.ts`
- `schemas/content-ops-render-job-v1.schema.json`
- `docs/business/shortform-content-ops-saas.md`
- `ROADMAP.md`

## Verification

- `npm run test:api` passed: 54/54.

## Known Blockers

- Render-job creation does not yet look up the active edit brief from Postgres;
  callers must provide the structured brief reference explicitly.
- Clip scoring, edit decision list persistence, and QC still do not consume the
  edit brief.
- The extraction is deterministic and intentionally conservative. Richer
  LLM-backed extraction can be added behind the same schema later.
- Live queue-backed real-render smoke and live R2/S3-compatible storage smoke
  remain pending from the worker storage slice.

## Recommended Next Action

Add active edit brief lookup at render-job creation, then define the first edit
decision list or clip-scoring contract that consumes
`content_ops.edit_brief.v1`. Keep raw chat text out of worker payloads.
