# Output Download Analytics Progress

Date: 2026-05-28

## Current Goal

Continue Phase 4 product analytics wiring beyond creation events by tracking
when ready render outputs are signed for download.

## Completed

- `GET /api/render-jobs/:id` now emits a best-effort `output_downloaded`
  product analytics event when a ready render job has signed output targets.
- The event includes only bounded aggregate metadata: output count, total
  duration seconds, and total size bytes.
- Tests assert analytics events do not include storage keys, output filenames,
  render output prefixes, credentials, or secret-shaped values.

## Changed Files

- `apps/api/src/render-jobs/service.ts`
- `apps/api/tests/render-jobs.test.ts`
- `ROADMAP.md`

## Verification

- `npm run test:api` passed: 98/98 after this unit.

## Known Blockers

- Worker callback product events remain pending: `render_started`,
  `render_ready`, and `render_failed`.
- Billing product events remain pending: `checkout_started` and
  `subscription_updated`.

## Recommended Next Action

Wire worker lifecycle product events through a worker-safe analytics boundary
or an API callback path, then add billing event emission when Stripe endpoints
and webhooks land.
