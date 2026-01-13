# Project Roadmap (Baseline Snapshot)

This document captures the roadmap as of the M3 baseline.

The baseline intentionally stops here to preserve a domain-agnostic, operationally complete system.

## Completed Milestones

### M0 — Foundations
-	Append-only persistence
-	Immutable event storage
-	Crash-safe invariants

### M1 — Event Ingestion
-	Idempotent event ingestion
-	Event ledger as source of truth

### M2 — Job Processing
-	Deterministic job creation
-	Explicit failure classification
-	No implicit retries or automation

### M3 — Manual Intervention
-	Explicit human intervention
-	Controlled manual requeue
-	Append-only audit log
-	Read-only operational visibility

### Roadmap Boundary

The baseline does not include:
-	Domain semantics
-	Automated recovery beyond M2
-	Dead Letter Queues
-	Product-driven workflows

All further evolution happens after this snapshot.