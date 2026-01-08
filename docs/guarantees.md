# Guarantees

This document describes the behavioral guarantees and explicit non-guarantees
introduced by Milestone M1.

It is intentionally scoped to **observable system behavior**, not implementation details.

---

## What M1 adds (compared to M0)

Milestone M1 introduces asynchronous processing and a minimal business effect,
while keeping ingestion simple and append-only.

### Asynchronous job processing

- Incoming events are persisted to an append-only event ledger.
- For each ingested event, a processing job is created.
- Jobs are processed asynchronously by a worker process.
- Job claiming is concurrency-safe via database locking
  (`SELECT ... FOR UPDATE SKIP LOCKED`).

### Effect-level idempotency

- M1 introduces a single business effect: **activate subscription**.
- Idempotency is enforced at the **effect level**, not at event ingestion.
- The unit of idempotency is `subscription_id`.
- An idempotency key is derived as: `activate_subscription:<subscription_id>`
- A UNIQUE constraint on the effect table guarantees that: multiple events/multiple jobs/multiple worker executions can result in **at most one business effect**.

### Observable processing state

- Job state transitions are persisted:
- `queued → in_progress → done`
- `queued → in_progress → failed`
- Business effect state is persisted and observable:
- `pending | succeeded | failed`
- Read-only admin endpoints expose:
- recent jobs and their status
- business effects and their status

This makes system behavior inspectable without direct database access.

---

## What M1 explicitly does NOT guarantee

Milestone M1 intentionally does **not** provide the following guarantees:

### No event deduplication at ingestion

- Duplicate events are accepted.
- Duplicate events produce:
- multiple rows in the event ledger
- multiple processing jobs
- Deduplication is **not** performed at ingest time.

### No exactly-once processing

- Jobs are processed at-least-once.
- Idempotency is achieved via effect-level constraints,
not via exactly-once execution.

### No retries or backoff

- Failed jobs remain in `failed` state.
- There are no automatic retries.
- There is no dead-letter queue.

### No ordering guarantees

- Events are not processed in a guaranteed order.
- No ordering is enforced across events, jobs, or effects.

### No event state machine

- Events are not interpreted as part of a lifecycle.
- There is no event transition model.

---

## Summary

M1 demonstrates a **minimal but real reliability boundary**:

- Events may arrive multiple times.
- Jobs may execute multiple times.
- The business effect happens **once and only once**.

All other guarantees (retries, ordering, deduplication at ingest,
multi-effect orchestration) are intentionally deferred to later milestones.
