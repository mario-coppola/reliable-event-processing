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

## D-002: M1 async processing boundaries and effect-level idempotency

**Date:** 2026-01-06

### Decision
Introduce asynchronous processing in M1 via a database-backed jobs table, while keeping ingestion semantics intentionally simple.

The following constraints are explicitly enforced:

- **Idempotency is applied at the effect level**, not at the event or ingestion level.
- **No deduplication at ingestion** (no UNIQUE constraint on `external_event_id` in the event ledger).
- **No retry, backoff, or dead-letter queues** in M1.
- **No ordering guarantees** in M1.
- The **event ledger remains append-only** and stores raw, unmodified event payloads.
- Processing state lives in **jobs / effects tables**, not in the event ledger.
- A single idempotent business effect is demonstrated in M1.
- The **idempotency key** for the M1 effect is defined as:
  `activate_subscription:<subscription_id>`.
- Workers process **one job at a time**, but must be **concurrency-safe**.
- Job claiming will use **`SELECT ... FOR UPDATE SKIP LOCKED`**.
- Event ingestion creates the event ledger row and the corresponding job row **atomically within a single database transaction**.

### Rationale
External events are unreliable and may be duplicated, delayed, or reordered. Recording all events faithfully while deferring idempotency to effect application allows the system to remain auditable, replayable, and correct under real-world conditions.

By scoping idempotency to the effect layer and deferring retries and ordering guarantees, M1 demonstrates correct asynchronous behavior without prematurely introducing complexity better suited for later milestones.

### Scope / Non-goals
This decision explicitly does **not** introduce:
- event-level deduplication
- retry or failure recovery mechanisms
- global or per-entity ordering guarantees
- worker orchestration beyond safe job claiming
- semantic interpretation of events at ingestion time

### D-003 — Controlled retries model (M2)

In M2 we introduce **controlled, observable, and bounded retries** at the job level, without altering the system’s safety boundary.  
**Effect-level idempotency remains the only idempotency guarantee.**

#### Structural decisions

- Retries are modeled on **the same job**, not by creating new jobs.
- Jobs explicitly include the following fields:
  - `attempts` (integer, initialized to 0)
  - `max_attempts` (integer, explicit and bounded)
  - `failure_type` (`retryable` | `permanent`, technical classification)
  - `last_error` (optional text)
  - `available_at` (TIMESTAMPTZ, minimal scheduling mechanism)

- A worker may claim a job **only if**:
  - `status = 'queued'`
  - `available_at <= now()`

- Job claiming and attempts increment are **atomic**:
  - `attempts` is incremented when transitioning the job to `in_progress`
  - Claim + attempts increment happen in the same DB transaction
  - Concurrency safety is enforced via `SELECT … FOR UPDATE SKIP LOCKED`

- Retry eligibility rules:
  - A job is retryable only if:
    - `failure_type = 'retryable'`
    - `attempts < max_attempts`
  - No infinite retries are allowed.

- Failure classification:
  - Failure classification is **technical**, not business/domain-driven.
  - Domain semantics and recovery strategies are explicitly out of scope for M2.

#### Explicit non-decisions

- No backoff strategies beyond `available_at`
- No dead-letter queue
- No external queues
- No ordering guarantees

This decision fixes the retry model for M2 and prevents retry-related complexity from leaking into later milestones.

### Additional clarifications

- `max_attempts` MUST be explicitly set when a job is created.
  - A system-level default value MAY be applied at insertion time by the API or worker.
  - This default is considered explicit configuration, not an implicit retry behavior.

- `failure_type` MAY be `NULL` until a job fails for the first time.
  - Classification (`retryable` | `permanent`) is applied only upon failure.
  - No pre-emptive or speculative classification is allowed.