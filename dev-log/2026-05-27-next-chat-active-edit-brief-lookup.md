# Next Chat Prompt: Active Edit Brief Lookup And Planning Contract

Date: 2026-05-27

Use this prompt to continue the shortform content ops SaaS work:

```text
We are in /Users/willis/Documents/Content-Creation-Agent.

First read:
1. AGENTS.md
2. DEVLOGS.md
3. ROADMAP.md
4. dev-log/2026-05-26-edit-brief-chat-render-wiring-progress.md
5. dev-log/2026-05-26-edit-brief-contract-progress.md
6. dev-log/2026-05-25-worker-s3-storage-progress.md

Context:
The product is a subscription SaaS for turning long-form media into short-form
clips. The architecture uses:
- Node API under apps/api
- Postgres migrations/repositories
- Redis/BullMQ queueing
- worker package under apps/worker
- S3-compatible storage boundaries
- Stripe as the intended billing provider
- Hyperframes for deterministic composition/rendering

Recent completed work:
- Added a versioned edit brief contract under apps/api/src/edit-briefs.
- Added schemas/content-ops-edit-brief-v1.schema.json.
- Added edit_briefs and edit_brief_versions to the initial SQL migration.
- Added POST /api/edit-briefs with:
  - deterministic defaults for an empty chat box
  - chatMessage support for conservative phrase-to-settings extraction
  - explicit structured settings overriding chat-derived settings
  - safe text validation and secret-shaped text rejection
  - append-only version persistence
- Extended content_ops.render_job.v1 and the API render contract so render
  payloads can carry render.edit_brief with active brief version metadata and
  normalized settings.
- API verification passed: npm run test:api, 54/54.

Important product decision:
Even if the user does not type anything in the edit brief chat box, the product
must still produce settings the user can tweak or leave as defaults. Raw chat
text must not become the worker control plane.

Architecture constraints:
- Do not introduce LangGraph or LangChain for the core workflow.
- Keep orchestration as a custom Postgres state machine with BullMQ workers.
- Hyperframes is composition/rendering only, not clip selection or editing
  quality logic.
- Queue payloads must contain storage keys and structured settings only, never
  OpenAI/Stripe/R2/S3/database credentials or raw prompt text.
- Preserve existing dirty worker/storage changes. Do not revert unrelated
  files, untracked assets/videos/, or prior dev-log files.

Current blocker / next implementation target:
Render-job creation can accept a structured editBrief object, but it does not
yet look up the active edit brief from Postgres. Callers currently need to pass
the structured brief explicitly.

Recommended next task:
Add active edit brief lookup at render-job creation, then define the first
planning contract that consumes content_ops.edit_brief.v1.

Suggested scope:
1. Inspect:
   - apps/api/src/edit-briefs/*
   - apps/api/src/render-jobs/*
   - apps/api/db/migrations/001_initial_content_ops.sql
   - schemas/content-ops-edit-brief-v1.schema.json
   - schemas/content-ops-render-job-v1.schema.json
   - apps/api/tests/edit-briefs.test.ts
   - apps/api/tests/render-jobs.test.ts
   - apps/api/tests/postgres-edit-brief-repository.test.ts
2. Add repository support to fetch the active edit brief by workspace/project
   and optional source asset.
3. Update render-job creation so if the request omits editBrief, the API tries
   to attach the active structured edit brief from persistence.
4. Keep explicit request.editBrief behavior working as an override for tests
   and future controlled callers.
5. Add tests for:
   - render job auto-attaches active edit brief when present
   - no edit brief found keeps render job creation working without edit_brief
   - explicit editBrief override wins over repository lookup
   - raw chat text never appears in render payloads
   - unsafe/secret-shaped active edit brief settings are rejected before queue
6. If time allows, start the first edit planning contract:
   - edit_decision_lists table or schema
   - pure function that maps transcript/clip candidates + edit brief settings
     into deterministic include/exclude/ranking hints
   - focused tests only; do not overbuild the full scoring system yet
7. Update ROADMAP.md and write a dated dev-log with changed files,
   verification, blockers, and the next action.

Verification to run:
- npm run test:api
- git diff --check

Previously pending worker follow-up:
After the active-brief lookup/planning contract slice, continue the queue-backed
real-render smoke with local Redis/Postgres, local fake storage, and a
Hyperframes command shim or real Hyperframes CLI.
```

## Current Goal

Hand off the next implementation slice after completing edit brief chat
extraction and render-payload wiring.

## Current State

- `POST /api/edit-briefs` supports empty chat defaults, nonblank `chatMessage`
  extraction, explicit structured overrides, and append-only versioning.
- Render-job payloads can carry optional structured `render.edit_brief`.
- Active edit brief lookup during render-job creation is not implemented yet.
- Clip scoring, edit decision lists, and QC do not consume edit briefs yet.

## Verification

- Latest implementation verification: `npm run test:api` passed 54/54.
- `git diff --check` passed.
- This handoff is documentation-only; no tests were run while writing it.

## Known Blockers

- Active edit brief lookup from Postgres is pending.
- First edit decision list or clip-scoring contract is pending.
- Worker real-render smoke and live R2/S3-compatible storage smoke remain
  pending.
- The worktree includes unrelated/pre-existing worker/storage changes and
  untracked `assets/videos/`; do not revert them without explicit instruction.

## Recommended Next Action

Implement active edit brief lookup at render-job creation, with explicit
`editBrief` override behavior preserved, then start a narrow edit planning
contract that consumes `content_ops.edit_brief.v1`.
