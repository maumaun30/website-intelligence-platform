# Foundation Design — Website Intelligence Platform

**Date:** 2026-07-20
**Status:** Approved
**Slice:** 1 of N (Foundation). No product features. Everything later builds on this.

## Context

Greenfield SaaS: AI-powered Website Intelligence Platform (crawling, SEO/accessibility/performance/security audits, AI explanations, dashboards, reports). Full product vision lives in the project brief. This spec covers only the foundation slice.

Agreed build order for subsequent slices:

1. **Foundation (this spec)**
2. Auth + Organizations (Better Auth, teams, RBAC)
3. Website management (add site, verify ownership, scan config)
4. Crawler (worker-based, snapshots)
5. Audit engine (plugin architecture + first SEO audits)
6. Dashboard (scores, trends)
7. AI explanations (provider abstraction)
8. Billing, reports, integrations — later

Each slice gets its own spec → plan → implementation cycle.

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| First slice | Foundation only | Every later slice depends on it |
| Local infra | Postgres + Redis + Mailpit only | YAGNI; Meilisearch/MinIO added with their features |
| Worker app | Included now | Proves BullMQ pipeline before crawler needs it |
| Prisma location | `packages/database` | api + worker both import; single source of truth |
| Backend structure | Pragmatic NestJS modules | Feature modules + repositories; ports/adapters reserved for complex domains (audit engine, AI layer) when built |
| Package manager | pnpm | Standard for Turborepo |
| CI | GitHub Actions | Conventional default |

## Repo Layout

```
website-intelligence-platform/
├── apps/
│   ├── web/        Next.js 15, React 19, TypeScript, Tailwind, shadcn/ui
│   ├── api/        NestJS REST API
│   └── worker/     BullMQ processors (NestJS standalone app, no HTTP)
├── packages/
│   ├── database/   Prisma schema, migrations, generated client
│   ├── types/      Shared DTOs, enums, Zod schemas
│   ├── config/     Env parsing/validation (Zod), shared constants
│   ├── ui/         Shared React components (shadcn base)
│   ├── eslint-config/
│   └── tsconfig/
├── docker-compose.yml   Postgres 16, Redis 7, Mailpit
├── turbo.json
└── .github/workflows/ci.yml
```

## Tooling

- pnpm workspaces + Turborepo. Tasks: `build`, `dev`, `lint`, `test`, `typecheck`.
- ESLint (flat config) + Prettier via shared packages.
- Husky + lint-staged + commitlint (Conventional Commits).
- GitHub Actions CI: lint → typecheck → test → build.

## App Internals

### apps/api

- NestJS bootstrap: Pino logger (structured), global Zod validation pipe, global exception filter.
- Versioned route prefix `/api/v1`.
- `/health` endpoint: checks DB and Redis connectivity, returns per-dependency status.
- Config consumed from `packages/config`; env validated at boot, fail-fast on missing/invalid vars.
- One documented example of the feature-module structure (controller / service / repository); no product features.

### apps/worker

- NestJS standalone application context (no HTTP server).
- BullMQ connection to Redis.
- One `example` queue + processor proving enqueue → process round-trip.
- Graceful shutdown: SIGTERM drains in-flight jobs before exit.

### apps/web

- Next.js App Router, TypeScript strict.
- Tailwind CSS + shadcn/ui installed and themed with defaults.
- TanStack Query provider wired.
- Typed API client stub hitting `/api/v1/health`.
- One page displaying API status (proves web → api connectivity).

### packages/database

- Prisma configured against local Postgres.
- Zero product models; migration infrastructure verified with an empty baseline migration.
- Product models arrive with their slices.

### packages/config

- Zod-validated env schemas per app; shared constants.
- `.env.example` per app.

### packages/types

- Placeholder for shared DTOs/Zod schemas; health-check response type as first inhabitant.

## Local Development

- `docker-compose.yml`: Postgres 16, Redis 7, Mailpit (SMTP preview).
- `pnpm dev` runs web + api + worker via Turborepo.
- Ports and credentials documented in root README.

## Testing

- Vitest workspace configuration.
- api: Supertest e2e test for `/health`.
- worker: queue round-trip test against real Redis from compose.
- Coverage thresholds deferred until business logic exists — no artificial targets on skeleton code.

## Error Handling

- Boot-time: invalid/missing env → process exits with clear message (fail-fast).
- api: global exception filter → consistent JSON error shape `{ statusCode, error, message }`.
- worker: failed jobs retain BullMQ retry/backoff defaults; failures logged via Pino.

## Out of Scope

- Authentication, any product feature, Meilisearch, MinIO/Spaces, Stripe, Sentry/OpenTelemetry wiring (added when there is traffic worth observing), deployment manifests beyond local compose.

## Success Criteria

- `pnpm install && docker compose up -d && pnpm dev` yields: web page showing API healthy, api `/health` green for DB + Redis, worker processes an example job.
- CI green on lint, typecheck, test, build.
- Conventional Commit enforced on commit.
