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

## Milestone M2 — Controlled Retries

Milestone M2 extends the system with **controlled, bounded, and observable retries**
while preserving the original reliability boundary: **effect-level idempotency**.

This milestone does not change ingestion semantics or business logic.
It only adds explicit retry mechanics around job execution.

---

## What M2 adds

### Retry state and limits

- Each job explicitly tracks:
  - `attempts`
  - `max_attempts`
- Attempts are incremented **atomically at claim time**.
- Retries are **bounded** by `max_attempts`.
- Infinite retries are structurally impossible.

### Technical failure classification

- Failures are classified as:
  - `retryable`
  - `permanent`
- Classification is **purely technical**, not domain-driven.
- Business logic is not encoded in retry decisions.

### Minimal scheduling via `available_at`

- Retries are scheduled using a single timestamp field:
  - `available_at`
- Workers only claim jobs where:
  - `status = queued`
  - `available_at <= now()`
- No dynamic backoff strategies are introduced.
- Scheduling remains explicit and inspectable.

### Same-job requeue

- Retries re-queue the **same job**.
- No new job rows are created for retries.
- Job identity and history are preserved.

### Observability

- Retry state is fully observable via read-only admin endpoints.
- `/admin/jobs` exposes:
  - `attempts`
  - `max_attempts`
  - `failure_type`
  - `last_error`
  - `available_at`
- API responses also include `server_now` to explain scheduling behavior.

---

## Guarantees introduced by M2

- Retries are **bounded and scheduled**.
- Retry execution is **safe** due to effect-level idempotency.
- Retry behavior is **explicit and inspectable**.
- Job execution remains concurrency-safe.
- The system never retries indefinitely.

---

## What M2 explicitly does NOT guarantee

- No dead-letter queue (DLQ).
- No exponential or adaptive backoff strategies.
- No ordering guarantees.
- No event deduplication at ingestion.
- No domain-level failure semantics.
- No automatic recovery beyond bounded retries.

---

## How to demo M2

### Retryable failure that succeeds
1. Ingest a valid event.
2. Trigger a transient failure (e.g. failpoint).
3. Observe:
   - job re-queued
   - `attempts` incremented
   - `available_at` in the future
4. Observe successful retry and job completion.

### Permanent failure
1. Ingest a malformed event.
2. Observe:
   - job fails immediately
   - `failure_type = permanent`
   - no retry scheduled.

### Scheduled retry visibility
1. Query `/admin/jobs`.
2. Compare:
   - `available_at`
   - `server_now`
3. Verify when and why a retry will occur (or not).

---

## M2 Summary

M2 completes the retry story without expanding system scope:

- Retries are **explicit**, **bounded**, and **observable**.
- Safety is guaranteed by **effect-level idempotency**, not execution semantics.
- Complexity remains deliberately constrained.

This milestone closes the reliability gap between
"failure is visible" (M1) and
"failure is recoverable" (M2),
without introducing orchestration or domain coupling.

## Milestone M3 — Manual Intervention & Auditability

Milestone M3 introduces **explicit human intervention** as a governance mechanism
when automation has definitively stopped (after M2).

M3 does **not extend automation**.
Instead, it defines a clear boundary between:
- what the system is allowed to do automatically
- what requires deliberate human decision

---

### What M3 adds

#### Manual re-queue (explicit)

- A job in `failed` state can be **manually re-queued**.
- The operation is:
  - explicit
  - validated
  - one-shot
- Re-queue:
  - operates on the **same job**
  - does **not** create new jobs
  - does **not** introduce new automation

#### Append-only audit log

- Every manual intervention produces **exactly one audit record**.
- Each record includes:
  - `job_id`
  - `action`
  - `actor`
  - `reason`
  - `timestamp`
- The audit log is:
  - append-only
  - immutable
  - strictly separated from job state

#### Read-only visibility of interventions

- Read-only admin endpoints allow:
  - inspection of manual interventions
  - correlation between audit entries and jobs
  - visibility of the resulting job state
- No control or mutation is possible via these endpoints.

---

### Guarantees introduced by M3

- Every manual intervention is:
  - **explicit**
  - **validated**
  - **fully auditable**
- No human action is invisible or implicit.
- The audit trail explains:
  - who intervened
  - when
  - why
- No change to the safety boundary:
  - idempotency remains at effect level
  - automated retries remain limited to M2 behavior

---

### What M3 explicitly does NOT guarantee

- M3 does **not** fix malformed or semantically invalid jobs.
- No Dead Letter Queue (explicit or implicit).
- No automatic recovery beyond M2.
- No domain-level semantics.
- No new automation.
- No ordering guarantees.
- No escalation or retry driven by audit entries.

The audit log **describes what happened**.
It does not decide what happens next.

---

### How to demo M3

1. Create a job that fails permanently.
2. Verify the job is in `failed` state.
3. Manually re-queue the job, providing:
   - `actor`
   - `reason`
4. Verify:
   - the updated job state
   - the presence of the audit record
5. Inspect everything via `/admin/interventions`.

---

### M3 Summary

M3 introduces **explicit governance without extending automation**:

- automation stops in a clear and observable way
- human intervention is visible and accountable
- the system remains minimal, explainable, and defensible

M3 closes without introducing:
- DLQ semantics
- orchestration
- domain logic