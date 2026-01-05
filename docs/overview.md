# System Overview (M0)

This document describes the system boundaries at the end of Milestone M0.
It intentionally documents both what exists and what does not yet exist.

---

## What exists in M0

At the end of M0, the system consists of:

- API process  
  - HTTP server exposing a `/health` endpoint  
  - Used as a basic operability check (process up / process down)

- Event ingestion endpoint  
  - POST /events/ingest  
  - Accepts JSON events from an external (fake) provider  
  - Performs basic payload validation  
  - Returns explicit HTTP responses:  
    - 202 Accepted for valid events  
    - 400 Bad Request for invalid payloads  
    - 503 Service Unavailable when the database is not reachable  

- Append-only event ledger  
  - Incoming events are persisted to PostgreSQL  
  - Events are stored as raw, uninterpreted payloads  
  - Events are never updated or mutated after insertion  

- Demo hammer script  
  - A simple script to send events to the ingestion endpoint  
  - Can send multiple valid events  
  - Can intentionally send duplicate events  
  - Can send an invalid payload to demonstrate validation failures  
  - Output is human-readable and reproducible  

- Local infrastructure  
  - PostgreSQL provided via docker-compose  
  - Used only for local development and demo purposes  

---

## What does not exist yet

The following guarantees and components are intentionally not implemented in M0:

- No idempotency or deduplication guarantees  
- No retry policies  
- No dead-letter queues  
- No worker-based event processing  
- No event state machine  
- No ordering guarantees  
- No semantic interpretation of events  

All of the above are deferred to later milestones.

---

## How to run the M0 demo

Start local infrastructure:  
```bash
pnpm infra:up
```

Start the API:  
```bash
pnpm dev:api
```

Send demo events:  
```bash
pnpm demo:send -- --count 5 --duplicates 2
```

Send an invalid payload (to demonstrate 400 Bad Request):  
```bash
pnpm demo:send -- --invalid
```

---

## Repo structure (short)

- apps/api – HTTP API process (ingestion, health)  
- apps/worker – background worker (not used in M0)  
- packages/shared – shared runtime utilities  
- infra – local infrastructure (docker-compose, SQL init)