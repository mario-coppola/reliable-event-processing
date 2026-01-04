# Overview

## Repository shape

This repository is a pnpm workspace monorepo for an async-first backend system.

### Packages

- `apps/api` — HTTP API (NestJS). Responsible for process bootstrap, routing and health checks.
- `apps/worker` — Background worker (NestJS) running as a separate process from the API.  
- `packages/shared` — Shared library (logger/config/runtime utilities).  
  Rule: **no domain logic** in this package.

### Infra

- `infra/docker-compose.yml` — Local dependencies (PostgreSQL).

## Local development

### Prerequisites

- Node.js (LTS recommended)
- pnpm via Corepack (pinned in the root `packageManager` field)
- Docker (for PostgreSQL)

### Commands

Start dependencies (PostgreSQL):
```bash
pnpm infra:up