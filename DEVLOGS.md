# Dev Logs Protocol

Use this file as the standing instruction for cross-chat continuity.

## New Chat Startup

When starting or continuing work in this repo, read these files first:

1. `AGENTS.md`
2. `ROADMAP.md`
3. the latest dated Markdown file in `dev-log/`

If `dev-log/` has no dated handoff yet, continue from `ROADMAP.md` and the
current task.

## When Asked For A Next-Chat Prompt

When the user asks for a full prompt for the next chat:

1. Inspect the latest files in `dev-log/`.
2. Summarize everything the next chat must know, inspect, or continue.
3. Save that prompt as a dated Markdown file in `dev-log/`.
4. Update `ROADMAP.md` based on the actual edits, blockers, verification
   status, and recommended next step from the current session.

## Dev Log Contents

Keep each handoff concise and implementation-facing. Include:

- current goal
- architecture decisions
- changed files
- tests or verification run
- known blockers
- recommended next action

Do not store secrets, API keys, tokens, passwords, private credentials, or raw
customer data in dev logs.
