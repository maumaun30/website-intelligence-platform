# Deploying to Railway

Written against the decisions in `superpowers/specs/2026-09-29-deployment-design.md`. Everything
below assumes the container images already on `main`.

## Before you start: two things that will bite

**1. The free plan will not hold this.** Railway's Trial gives a **one-time $5 grant** (1 GB RAM,
2 vCPU per service). This stack is five always-on services — web, api, worker, Postgres, Redis —
and the worker cannot sleep: it holds the queues and ticks the scan scheduler every 60 seconds. A
one-time $5 buys days, not months. Hobby ($5/month, $5 usage included) is the realistic floor, and
even that is tight with five services.

Two ways to spend less, if that matters more than simplicity:

- Move the data stores off Railway — Postgres on Neon, Redis on Upstash — so Railway runs three
  services instead of five. Verify BullMQ against whichever Redis you pick before committing to
  it: BullMQ needs blocking commands and a connection with `maxRetriesPerRequest: null`, and not
  every hosted Redis serves those the same way.
- Put the web app on Vercel (its free tier suits a Next.js front end) and keep api, worker and the
  stores on Railway.

**2. Railway's generated domains break sign-in.** The API sets the session cookie, and the browser
only sends it back to the web app if both are on one registrable domain. Two
`*.up.railway.app` hostnames are not that: `up.railway.app` is on the Public Suffix List, so a
browser refuses a cookie scoped to it. **You need a custom domain** — `example.com` for the web
app, `api.example.com` for the API — and `AUTH_COOKIE_DOMAIN=.example.com` on the API, which
widens the cookie to cover both.

Without a domain you can still deploy and reach the health endpoint; you just cannot stay signed
in.

## 1. Project and data stores

1. New project → **Deploy from GitHub repo** → this repository.
2. Add **Postgres** and **Redis** from the Railway catalogue. Both stay on the private network;
   give neither a public domain.

## 2. The three services

Each service builds **from the repository root**, because pnpm workspaces need the lockfile and
every workspace package at install time. For each one:

- **Root Directory:** leave blank.
- **Variable `RAILWAY_DOCKERFILE_PATH`:** `apps/api/Dockerfile`, `apps/worker/Dockerfile`, or
  `apps/web/Dockerfile`.
- **Watch paths** (optional): limit redeploys to what the service actually depends on, e.g.
  `apps/api/**` and `packages/**` for the API.

Only the web and api services get a public domain. The worker gets none.

## 3. Variables

Reference the stores rather than copying credentials: Railway resolves `${{Postgres.DATABASE_URL}}`
and `${{Redis.REDIS_URL}}` on the private network.

**All three:** `NODE_ENV=production`, `APP_URL=https://example.com`.

**api**

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
PORT=4000
BETTER_AUTH_SECRET=<32+ random characters, not the development one>
BETTER_AUTH_URL=https://api.example.com
AUTH_COOKIE_DOMAIN=.example.com
CORS_ORIGINS=https://example.com
AI_EXPLANATIONS_ENABLED=true
STRIPE_PROVIDER=stripe
STRIPE_SECRET_KEY=<live key>
STRIPE_WEBHOOK_SECRET=<from the webhook you create in step 6>
STRIPE_PRICE_PRO=<live price id>
STRIPE_PRICE_AGENCY=<live price id>
SENTRY_DSN=<optional>
SENTRY_ENVIRONMENT=production
```

**worker**

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
WORKER_CONCURRENCY=5
ALLOW_PRIVATE_SCAN_TARGETS=false
EMAIL_PROVIDER=resend
RESEND_API_KEY=<key>
SMTP_FROM=Wintel <no-reply@example.com>
ANTHROPIC_API_KEY=<key>
AI_EXPLANATION_PROVIDER=anthropic
SENTRY_DSN=<optional>
SENTRY_ENVIRONMENT=production
```

`ALLOW_PRIVATE_SCAN_TARGETS` must stay false. With it on, anyone can register a website pointing at
an internal address and read the response back out of the stored scan.

**web**

```
NEXT_PUBLIC_API_URL=https://api.example.com
```

Next inlines `NEXT_PUBLIC_*` at build time, so this is read during the image build. Changing it
needs a rebuild, not a restart.

## 4. Migrations

Set the API service's **pre-deploy command** so the schema is current before the new revision
serves traffic:

```
node /app/node_modules/prisma/build/index.js migrate deploy --schema=/app/packages/database/prisma/schema.prisma
```

Only the API runs this. Two services racing the same migration is how a schema ends up
half-applied.

## 5. Deploy order

API first, so migrations run, then worker, then web.

## 6. Domain and Stripe

1. Point `example.com` at the web service and `api.example.com` at the API, and confirm HTTPS on
   both.
2. Create the production Stripe webhook against
   `https://api.example.com/api/v1/billing/webhook`, and put its signing secret in the API's
   `STRIPE_WEBHOOK_SECRET`. The signature is the webhook's only authentication, so a wrong secret
   means every event is rejected.

## 7. Smoke test, in this order

Sign up → verify the email → add a website → verify it by DNS → scan it → read the audit →
generate one AI explanation → subscribe with a real card → cancel from the Billing Portal.

## 8. Only then, OAuth

Create the GitHub and Google OAuth apps with callbacks at
`https://api.example.com/api/v1/auth/callback/github` and `.../google`, and set
`GITHUB_CLIENT_ID`/`SECRET` and `GOOGLE_CLIENT_ID`/`SECRET` on the API. Each provider only appears
on the sign-in page once both halves of its pair are set.

## Still open

- The **grandfather migration** putting existing organizations on `pro` is not written yet. It
  matters only if real organizations exist before the first deploy.
- Backups: Railway's Postgres snapshots, or a scheduled dump elsewhere.
- Browser error tracking for the web app.
