# Baseline M3

This baseline is a frozen, runnable state aligned with the roadmap milestone M3.

## Included
- Admin endpoints for manual requeue with audit trail
- Read-only interventions visibility
- Zod request validation (query/body)
- Unit tests for:
  - Zod schemas parsing / rejection
  - AdminService requeue behavior (mocked repos)
- Demo script validating regression flow

## Not included (by design)
- Product-specific business features beyond the reliability scaffolding
- Integration test harness with real DB assertions inside Jest
- Production hardening (auth, rate limits, observability pipelines)

## How to verify
Run:
- `pnpm -w lint`
- `pnpm -w typecheck`
- `pnpm -w test`
- `pnpm demo:m3`