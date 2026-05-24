# Next Chat Prompt: Backend API MVP

Use this prompt to continue development in a fresh chat.

```text
Read AGENTS.md, DEVLOGS.md, ROADMAP.md, and the latest dated file in dev-log/ before making changes.

We are building a shortform content ops SaaS. The target architecture is:
- Next.js App Router frontend with React and TypeScript
- Node backend, preferably Fastify or NestJS
- Postgres
- Cloudflare R2 by default, S3-compatible by contract
- Redis/BullMQ queue, with SQS-compatible boundaries later if needed
- Worker containers running FFmpeg plus overlay rendering
- OpenAI transcription API
- Stripe subscriptions and webhooks

Current repo context:
- This repo is ECC, but it now contains a tracked content ops workflow under src/llm/content_ops/.
- src/llm/content_ops/agent.py parses transcripts and generates clip candidates, captions, hooks, calendar items, and analytics plans.
- src/llm/content_ops/transcription.py extracts audio with FFmpeg and supports OpenAI transcription.
- src/llm/content_ops/rendering.py plans and executes FFmpeg render jobs with overlay assets.
- src/llm/content_ops/cli.py exposes the local CLI workflow.
- src/llm/content_ops/platform.py is the production SaaS workflow contract: subscription tiers, render entitlements, storage keys, queue payloads, idempotency keys, and render job state transitions.
- docs/business/shortform-content-ops-saas.md documents the architecture.
- ROADMAP.md is the source of truth for development phases.
- DEVLOGS.md defines cross-chat continuity rules.

Important workflow rules:
- Follow AGENTS.md.
- Check the latest dev-log entry before planning context-dependent work.
- When asked to create a next-chat prompt, save it in dev-log/ and update ROADMAP.md.
- Do not store secrets in dev logs, code, queue payloads, or docs.
- Keep queue payloads free of API keys and credentials.
- Use TDD for new implementation.

Verification status from the prior session:
- python3 -m compileall src/llm/content_ops passed.
- A direct smoke check of src/llm/content_ops/platform.py passed.
- Full pytest could not run because the local Python environment is missing pytest.
- Importing through the top-level llm package requires the openai dependency to be installed.

Current blockers:
- Backend app scaffold does not exist yet.
- Local Python environment is missing pytest.
- Top-level llm import currently requires openai to be installed.

Recommended next development task:
Scaffold apps/api with tests for POST /api/render-jobs, then implement the minimum backend path that:
1. validates a render job request,
2. checks subscription usage and plan limits,
3. creates or models a render job record,
4. returns/enqueues a content_ops.render_job.v1-compatible queue payload,
5. rejects quota-exceeded requests before enqueueing,
6. uses a consistent API response envelope.

Before coding, decide whether to:
- port the platform contract from Python into shared TypeScript for the Node API, or
- keep the Python contract as reference documentation and implement the backend contract natively in TypeScript.

Prefer the TypeScript implementation for apps/api so the backend can own validation and queue contracts directly.
```

## Changed Files To Inspect

- `AGENTS.md`
- `DEVLOGS.md`
- `ROADMAP.md`
- `dev-log/README.md`
- `docs/business/shortform-content-ops-saas.md`
- `src/llm/content_ops/platform.py`
- `tests/test_shortform_platform.py`

## Recommended First Command

```bash
cd /Users/willis/Documents/Content-Creation-Agent
sed -n '1,220p' DEVLOGS.md
sed -n '1,260p' ROADMAP.md
sed -n '1,260p' src/llm/content_ops/platform.py
```
