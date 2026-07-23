# Website Intelligence Platform

[![CI](https://github.com/maumaun30/website-intelligence-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/maumaun30/website-intelligence-platform/actions/workflows/ci.yml)

AI-powered platform that continuously monitors websites and helps agencies, developers, and
businesses identify, prioritize, and resolve technical issues.

This repository currently contains the **foundation slice**: the monorepo, shared packages, and
three running applications wired to Postgres and Redis. There are no product features yet.

## Requirements

- Node 22 LTS (`nvm use`)
- pnpm 10 (`corepack enable`)
- Docker with Compose v2

## Quick start

```bash
nvm use
corepack enable
pnpm install
cp .env.example .env
pnpm infra:up      # Postgres, Redis, Mailpit
pnpm db:migrate    # apply migrations
pnpm dev           # web + api + worker
```

Then open:

| Service       | URL                                 |
| ------------- | ----------------------------------- |
| Web dashboard | http://localhost:3000               |
| API health    | http://localhost:4000/api/v1/health |
| Mailpit inbox | http://localhost:8025               |

## Ports

Postgres and Redis run on non-default host ports so they don't collide with anything already
installed locally.

| Service      | Host port |
| ------------ | --------- |
| web          | 3000      |
| api          | 4000      |
| Postgres     | 5433      |
| Redis        | 6380      |
| Mailpit UI   | 8025      |
| Mailpit SMTP | 1025      |

## Repository layout

| Path                     | Purpose                                                   |
| ------------------------ | --------------------------------------------------------- |
| `apps/web`               | Next.js 15 dashboard                                      |
| `apps/api`               | NestJS REST API (`/api/v1`)                               |
| `apps/worker`            | NestJS standalone BullMQ worker                           |
| `packages/config`        | Zod-validated environment schemas and shared constants    |
| `packages/types`         | Shared contracts consumed by every client                 |
| `packages/database`      | Prisma schema, migrations, and client factory             |
| `packages/ui`            | Shared React components (source-only, transpiled by Next) |
| `packages/tsconfig`      | Shared TypeScript presets                                 |
| `packages/eslint-config` | Shared ESLint flat configs                                |

## Architecture notes

**Shared package build strategy.** Node-side packages (`config`, `types`, `database`) compile to
CommonJS with `tsc` and are consumed through `dist`. The browser-side package (`ui`) ships
TypeScript source and is transpiled by Next.js via `transpilePackages`. This avoids maintaining a
bundler for a package only one consumer uses, and avoids the `"use client"` directive being
stripped by an intermediate build step.

**Two deliberate deviations from the design spec:**

1. Vitest is configured per-package rather than through a single Vitest workspace file. Turborepo
   already orchestrates cross-package test runs, and each package needs its own environment
   (`node` for the API, `jsdom` for the web app).
2. The Zod validation pipe is applied per-route (`@Body(new ZodValidationPipe(schema))`) rather
   than globally, because a global pipe cannot know which schema applies to which route.

## Testing

```bash
pnpm infra:up
pnpm test
```

Integration tests in `packages/database`, `apps/api`, and `apps/worker` run against the real
Postgres and Redis from Docker Compose. They are not mocked, on purpose: the value of these tests
is proving the wiring works.

## Commits

Conventional Commits, enforced by commitlint on `commit-msg`. `pre-commit` runs Prettier and
ESLint over staged files via lint-staged.
