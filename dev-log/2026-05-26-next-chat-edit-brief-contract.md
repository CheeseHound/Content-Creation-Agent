# Next Chat Prompt: Edit Brief Contract

Date: 2026-05-26

Use this prompt to continue the shortform content ops SaaS work:

```text
We are in /Users/willis/Documents/Content-Creation-Agent.

First read:
1. AGENTS.md
2. ROADMAP.md
3. DEVLOGS.md
4. dev-log/2026-05-25-worker-s3-storage-progress.md
5. dev-log/2026-05-25-next-chat-real-render-smoke-and-storage.md

Context:
The product is a subscription SaaS for turning long-form media into short-form
clips. The current implementation uses:
- Node API under apps/api
- Postgres migrations/repositories
- Redis/BullMQ queueing
- worker package under apps/worker
- S3-compatible storage boundaries
- Stripe as the intended billing provider
- Hyperframes for deterministic composition/rendering

New product decision from 2026-05-26:
After a user uploads a video, the website should provide an edit brief chat.
The user can describe what they want: tone, pacing, platforms, moments to keep,
moments to remove, caption style, crop style, music mood, and other creative
constraints. This chat should convert natural-language intent into a validated
structured edit brief that workers use for clip scoring, edit planning, QC, and
rendering.

Architecture decisions:
- Do not use LangGraph.
- Do not use LangChain for the core product workflow.
- Keep the production backbone as a custom Postgres-backed state machine with
  BullMQ worker queues and durable artifacts.
- Hyperframes is the render/composition layer only. It should not be treated as
  the editing-quality brain.
- Editing quality should come from transcript alignment, audio analysis, visual
  analysis, clip scoring, edit decision lists, and QC checks before rendering.

Recommended next task:
Implement the edit brief contract before building the frontend chat UI.

Recommended scope:
1. Inspect:
   - ROADMAP.md
   - docs/business/shortform-content-ops-saas.md
   - src/llm/content_ops/platform.py
   - apps/api/src/render-jobs/contract.ts
   - apps/api/src/render-jobs/types.ts
   - apps/api/db/migrations/001_initial_content_ops.sql
   - schemas/content-ops-render-job-v1.schema.json
2. Define a structured edit brief shape with fields like:
   - goal
   - tone
   - pacing
   - targetPlatforms
   - include
   - exclude
   - clipLengthSeconds
   - captionStyle
   - cropStrategy
   - music
   - editorialRules
3. Add persistence for:
   - edit_briefs
   - edit_brief_versions
   - edit_constraints if useful
   - edit_decision_lists if the implementation reaches planning output
4. Add API/domain code that validates the structured edit brief. Keep it
   deterministic and schema-driven.
5. Add tests for:
   - valid edit brief acceptance
   - unsafe/oversized free text rejection or normalization
   - versioning behavior
   - no secrets or credentials in worker payloads
6. Wire the active edit brief into render/clip planning data only if the change
   can stay small. Otherwise leave a clear contract and TODO boundary.
7. Update ROADMAP.md and write a dated dev-log with completed work,
   verification, blockers, and next action.

Important constraints:
- Chat produces structured settings. It should not directly control workers.
- Never place OpenAI, Stripe, R2/S3, or database secrets in queue payloads.
- Keep queue payloads deterministic and replayable.
- Do not touch unrelated untracked assets/videos/ unless explicitly asked.
- If you modify existing files with user changes, preserve their changes.
- Use tests first where practical and run focused verification.

Previously recommended worker follow-up still exists:
After the edit brief contract is in place, continue the queue-backed real-render
smoke with local Redis/Postgres, local fake storage, and a Hyperframes command
shim or real Hyperframes CLI.
```

## Current Goal

Add the edit brief intake architecture to the roadmap and hand off the next
implementation slice.

## Architecture Decisions

- Use an edit brief chat as an intent-to-settings layer.
- Keep custom Postgres/BullMQ orchestration.
- Exclude LangGraph and LangChain from the core product architecture.
- Keep Hyperframes focused on composition/rendering, not clip selection or edit
  quality decisions.

## Changed Files

- `ROADMAP.md`
- `dev-log/2026-05-26-next-chat-edit-brief-contract.md`

## Verification

- Documentation-only change.
- No tests run.

## Known Blockers

- Edit brief schema, persistence, and API endpoints are not implemented yet.
- Live queue-backed real-render smoke remains pending from the previous worker
  storage slice.
- Live R2/S3-compatible storage smoke remains pending.

## Recommended Next Action

Implement the edit brief contract and persistence first, then connect it to clip
scoring/render planning. Keep frontend chat work behind that contract so the UI
does not depend on unstructured prompt text.
