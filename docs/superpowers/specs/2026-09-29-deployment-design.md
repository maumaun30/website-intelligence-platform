# Production Deployment Design — Website Intelligence Platform

**Date:** 2026-09-29
**Status:** Approved for planning. The three decisions below were made by the product owner;
everything marked **Open** still needs an answer before the deploy runs.
**Depends on:** everything through PR #12 (all of `main` at `20810c0`).

## Context

The platform has never left a laptop. There is no Dockerfile, no host configuration and no deploy
pipeline — CI lints, typechecks, tests and builds, and stops there. Two features now depend on a
real deployment: GitHub and Google sign-in (which need public callback URLs) and live Stripe
(which needs a public webhook endpoint).

Four processes have to run somewhere: the Next.js web app, the NestJS API, the BullMQ worker, and
the Postgres and Redis they share. The worker is not optional and not serverless — it holds the
scan, audit, explanation and scheduler queues, and the scheduler ticks every 60 seconds.

## Goals

1. One command, or one push, deploys a known-good commit of all three apps.
2. Migrations run exactly once per release, before the new code serves traffic.
3. Sessions, Stripe webhooks and OAuth callbacks all work against real domains over HTTPS.
4. Existing organizations keep working on the day of the deploy.
5. Secrets live in the host, never in the repo, and are different from the development ones.

## Non-Goals

- Autoscaling, multi-region, or blue/green deploys. One instance of each process is enough for now.
- Moving off Prisma, Postgres or BullMQ.
- A staging environment (worth having later; not what blocks OAuth today).

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Host | **Railway**, four services in one project: web, api, worker, plus managed Postgres and Redis | The worker needs a persistent process, which rules out a purely serverless host. Railway gives all four in one project with a private network between them, and is the shortest path to a working deploy. |
| Existing organizations | **Grandfather to `pro`** in a migration | Without it, every organization that already exists silently drops to `free` on the first boot: schedules stop, crawls clamp to 100 pages, and the next insights diff reports dropped pages as "fixed". |
| Stripe | **Live mode from day one**, with a production webhook endpoint | The code already treats the webhook as the only writer of `Organization.plan`. Any other setting leaves owners able to grant themselves paid plans for free. |
| Builds | A Dockerfile per app, built from the repo root | pnpm workspaces need the lockfile and every workspace package present at install time; a root-context build is the only reliable way to get that. Nixpacks guesses wrong on a Turborepo monorepo. |
| Migrations | `prisma migrate deploy` as the API service's release command | One runner, before the new revision serves traffic. The worker must never run it — two processes racing the same migration is how a schema gets half-applied. |
| Session cookies | API on `api.<domain>`, web on `<domain>`, with Better Auth cross-subdomain cookies enabled | Cookies are host-only today, which is fine on localhost and broken across two hostnames. The alternative — proxying `/api` through the web app — adds a hop to every request. |

## Architecture

### Services

| Service | Process | Notes |
|---|---|---|
| `web` | `next start --port $PORT` | Public. Needs `NEXT_PUBLIC_API_URL` **at build time** — Next inlines it, so it is a build argument, not just a runtime variable. |
| `api` | `node dist/main.js` | Public. Release command runs migrations. Health at `/api/v1/health`. |
| `worker` | `node dist/main.js` | No public ingress. Holds every queue and the 60-second scheduler tick. |
| `postgres` | Railway Postgres | Private network only. |
| `redis` | Railway Redis | Private network only. BullMQ needs persistence enabled; a flushed Redis loses queued jobs. |

### Build

Three Dockerfiles (`apps/*/Dockerfile`), each built with the repo root as context:

1. `corepack enable` and install with the committed `pnpm-lock.yaml` (`--frozen-lockfile`).
2. `pnpm --filter <app>... build` so the workspace packages that app depends on build first.
   `@wintel/database` must run `prisma generate` during its build — the generated client is
   gitignored, so a build without it fails at runtime, not at compile time.
3. A runtime stage on `node:22-slim` with `pnpm deploy --filter <app> --prod` output, running as a
   non-root user.

### Environment

Every variable is validated by `@wintel/config` at boot, so a missing one fails the deploy rather
than the first request that needs it.

**Shared:** `NODE_ENV=production`, `LOG_LEVEL=info`, `DATABASE_URL`, `REDIS_URL` (both from
Railway's private network), `APP_URL=https://<domain>`.

**api:** `PORT`, `BETTER_AUTH_SECRET` (fresh, 32+ chars, not the development one),
`BETTER_AUTH_URL=https://api.<domain>`, `CORS_ORIGINS=https://<domain>`,
`AI_EXPLANATIONS_ENABLED`, `STRIPE_PROVIDER=stripe`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_AGENCY`, and — once the OAuth apps
exist — `GITHUB_CLIENT_ID`/`SECRET` and `GOOGLE_CLIENT_ID`/`SECRET`.

**worker:** `WORKER_CONCURRENCY`, `SMTP_HOST`/`PORT`/`FROM` (plus credentials once a real provider
is chosen), `ANTHROPIC_API_KEY`, `AI_EXPLANATION_PROVIDER=anthropic`.

**web (build arg):** `NEXT_PUBLIC_API_URL=https://api.<domain>`.

### The grandfather migration

A single SQL migration setting `plan = 'pro'` for every organization created before the deploy.
It must be idempotent and must not touch organizations created afterwards, so it is written as a
one-shot `UPDATE ... WHERE "createdAt" < <deploy timestamp> AND plan = 'free'`, committed with the
timestamp baked in rather than computed at runtime.

## Blockers to fix before going public

These are not optional polish; each one is a way the deployment can hurt someone.

1. **The crawler will fetch anything it is given.** `page-fetcher.ts` fetches whatever URL a
   website record holds, with no check on where it resolves. On a shared host that is server-side
   request forgery: a user can register `http://169.254.169.254/...` or a private address and have
   the worker fetch it from inside the network, then read the response back out of the scan's
   stored pages. Before any public sign-up: resolve the hostname first, refuse loopback, private,
   link-local and unique-local ranges, refuse non-`http(s)` schemes, and re-check after every
   redirect. Verification fetches need the same guard.
2. **Email has no real provider.** SMTP still points at the local Mailpit container, so
   verification, invitation and email-change messages would vanish. **Open:** which provider.
3. **No error tracking.** A failed scan or webhook currently exists only in a log line nobody
   reads.

## Rollout

1. Dockerfiles, a `.dockerignore`, and a CI job that builds all three images on `main`.
2. Provision the Railway project: Postgres, Redis, then the three services on the private network.
3. Set secrets; deploy `api` first so migrations run, then `worker`, then `web`.
4. Point DNS at `<domain>` and `api.<domain>`; confirm HTTPS on both.
5. Register the production Stripe webhook against `https://api.<domain>/api/v1/billing/webhook`
   and put its signing secret in the API's environment.
6. Smoke test on production: sign up, verify the email, add a website, verify it by DNS, scan it,
   read the audit, generate one AI explanation, subscribe with a real card, cancel from the Portal.
7. Only then create the GitHub and Google OAuth apps with callbacks at
   `https://api.<domain>/api/v1/auth/callback/{github,google}`, and add the four variables.

## Open questions

- Domain name, and whether the API gets `api.<domain>` or a path on the same host.
- Transactional email provider (Resend, Postmark, SES) — needed before anyone can verify an email.
- Backups: Railway's Postgres snapshots, or a scheduled dump somewhere else.
- Error tracking, if any (Sentry is the obvious fit and costs nothing at this size).
- Whether a staging environment comes now or later.
