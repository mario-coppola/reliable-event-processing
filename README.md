# Reliable Event Processing

## Baseline (post-M3)

This repository includes a stable technical baseline capturing the system state after Milestone M3 and the full internal refactor.

The baseline represents a functionally complete, auditable, and invariant-preserving system, intentionally agnostic to domain-specific product decisions.

It is provided as a reference point before introducing higher-level business semantics and product-driven features.
- Baseline release (tagged snapshot):
https://github.com/mario-coppola/reliable-event-processing/releases/tag/baseline-m3
- Baseline branch:
https://github.com/mario-coppola/reliable-event-processing/tree/baseline-m3

The baseline includes:
- Explicit event ingestion and job processing (M1–M2)
- Manual, audited human intervention (M3)
- Read-only operational visibility
- Strict guarantees and documented non-guarantees

Further development on main continues after this baseline and may introduce new semantics, automation, or product-specific behavior.

## Development

See `docs/dev-setup.md` for local development setup instructions.

## Problem
## Goal
## What this project demonstrates
## Non-goals
## High-level architecture
## Demo / How to try it
## Guarantees & failure modes
## Project status
