# Reliable Event Processing — Baseline M3

This repository demonstrates a minimal, test-driven foundation for reliable
event ingestion and job processing.

Key properties:
- idempotent event ingestion
- durable job persistence
- manual intervention tooling (requeue) with audit trail
- schema-based request validation (Zod)
- fast unit tests for validation and admin service behavior
- end-to-end demo script to validate system invariants

----------------------------------------------------------------

## Baseline M3 snapshot

The tag "baseline-m3" represents a known-good, runnable snapshot of the project
after:

- refactor for separation of concerns
- standardized error handling
- Zod-based request validation
- unit tests for schemas and admin service logic
- regression demo script (demo:m3)

This baseline is intentionally feature-agnostic and suitable as a reference
implementation.

----------------------------------------------------------------

## Requirements

- Node.js
- pnpm
- Docker (for local Postgres via docker compose)

----------------------------------------------------------------

## Install

Run:
pnpm -w install

----------------------------------------------------------------

## Run locally (development)

Start infrastructure:
pnpm infra:up

Start API and worker (in separate terminals):
pnpm dev:api
pnpm dev:worker

----------------------------------------------------------------

## Quality checks

Lint:
pnpm -w lint

Typecheck:
pnpm -w typecheck

Unit tests:
pnpm -w test

----------------------------------------------------------------

## Regression / demo flow

Run:
pnpm demo:m3

This script validates:

- successful event ingestion and processing
- durable ledger and job creation
- permanent failure handling
- manual requeue with audit logging
- read-only visibility of interventions
- schema validation for invalid input
- negative admin paths (409 / 404 / 400)

----------------------------------------------------------------

## Notes

- The demo script is designed to run with the worker active.
- Job status transitions may be fast due to asynchronous processing.
- The branch "baseline/m3" exists for documentation and reproducibility.
- Feature development continues on main.

For context and rationale behind this snapshot, see docs/baseline.md