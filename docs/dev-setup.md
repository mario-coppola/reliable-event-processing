# Development Setup

This document describes how to set up the local development environment.

---

## Prerequisites

- Node.js (managed via fnm)
- pnpm (via corepack)
- Docker + Docker Compose

---

## Node and package manager

Enable corepack and install pnpm:

```bash
corepack enable
```  
```bash
corepack prepare pnpm@latest --activate
```

Verify versions:

```bash
node -v
```  
```bash
pnpm -v
```

---

## Install dependencies

From the repository root:

```bash
pnpm install
```

---

## Local infrastructure

Start PostgreSQL using Docker Compose:

```bash
pnpm infra:up
```

Stop infrastructure:

```bash
pnpm infra:down
```

---

## Development commands

Start the API:

```bash
pnpm dev:api
```

Start the worker (not used in M0):

```bash
pnpm dev:worker
```

---

## Demo script

Run the demo hammer:

```bash
pnpm demo:send
```

Additional examples:

```bash
pnpm demo:send -- --count 10 --duplicates 3
```  
```bash
pnpm demo:send -- --invalid
```