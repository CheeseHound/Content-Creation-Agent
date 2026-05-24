# CI Unblock Progress

Date: 2026-05-22

## Current Goal

Remove the repository-level test blockers so backend SaaS development can
continue with a reliable full-suite signal.

## Changes

- Replaced decorative star rating glyphs in the Windows desktop E2E skill docs
  with ASCII `5/5`, `4/5`, and `3/5` ratings.
- Fixed migrated source-command Codex skill frontmatter and added
  `agents/openai.yaml` metadata for each new skill.
- Made npm pack surface tests parse JSON robustly when npm prints lifecycle
  banners before the `--json` payload.
- Normalized nested skill manifest paths in `.trae/install.sh` so generated
  manifest entries do not contain a double slash.

## Verification

- `node scripts/ci/check-unicode-safety.js` passes.
- `node tests/ci/codex-skill-surface.test.js` passes.
- `node tests/scripts/build-opencode.test.js` passes.
- `node tests/scripts/npm-publish-surface.test.js` passes.
- `node tests/scripts/trae-install.test.js` passes.
- `npm test` passes: 2,568 passed, 0 failed.
- `npm run test:api` passes: 13 passed, 0 failed.

## Known Blockers

- Local Python environment is still missing `pytest`.
- Top-level `llm` imports still require `openai` to be installed.

## Recommended Next Action

Continue the backend MVP by wiring `apps/api` to a real Postgres client and
migration runner, then add the Redis/BullMQ queue adapter for
`content-ops-render`.
