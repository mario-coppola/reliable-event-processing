# Decision Log

This file tracks non-trivial architectural and product decisions.
Append-only.

## D-001: Async-first system shape (pnpm monorepo + API/Worker split)

**Date:** 2026-01-05

### Decision
Adopt a pnpm workspace monorepo with two separate runtime processes:

- `apps/api` — HTTP process for operational endpoints and (later) external event ingestion.
- `apps/worker` — non-HTTP process for asynchronous/background execution.

Introduce a shared internal package:
- `packages/shared` (`@pkg/shared`) — platform utilities only (structured logger and shutdown/lifecycle helpers).

Provide local runtime dependencies via Docker Compose:
- `infra/docker-compose.yml` — PostgreSQL for local development (no schema/migrations in this phase).

Standardize local developer commands at the repo root:
- `pnpm dev:api`, `pnpm dev:worker`, `pnpm infra:up`
- Use a shared dev runner script to normalize Ctrl+C shutdown (avoid false failures on SIGINT).

### Rationale
Reliable event-driven systems require a clear separation between synchronous ingress (HTTP/API) and asynchronous processing (worker). A monorepo/workspace setup keeps dependency management and tooling consistent across processes. Shared platform utilities reduce duplication while preserving boundaries. Docker Compose makes local development reproducible and close to production assumptions.

### Scope / Non-goals
This decision does **not** define:
- event semantics or provider integrations
- idempotency, deduplication, retry policies, or ordering guarantees
- database schema, migrations, or persistence model