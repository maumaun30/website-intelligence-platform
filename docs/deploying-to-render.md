# Deploying for free: Render, Supabase and Vercel

A $0 setup for development and early users. The api and worker run as **one** Render web service
(`deploy/render/Dockerfile`), because Render's free tier has no background-worker type. Redis is
Render's free Key Value, Postgres is Supabase's free tier, and the web app is on Vercel. For the
same app on a server you control, see `deploying-to-digitalocean.md`.

This runbook uses `wintel.example.com` for the web app and `api.wintel.example.com` for the API.

## What free costs you

- **Render spins a free service down after 15 minutes without traffic.** An uptime monitor
  pinging the health endpoint keeps it up, and the worker with it. Render's 750 free hours a month
  cover one service running all month, so this is the only free service you can keep awake.
- **512 MB and 0.1 CPU.** Both apps idle at about 165 MB together, so memory is fine; a tenth of
  a CPU makes boots and scans slow. Render also restarts free services now and then; in-flight jobs retry.
- **The free Key Value is 25 MB and not persistent.** Plenty for queues at this size. A restart of the store
  loses whatever was queued.
  Queued jobs are retried by the user, not lost data: everything durable is in Postgres.
- **Connections.** The two apps hold 11 Redis connections between them: queues share one per
  app, and each worker adds a blocking one. A deploy runs the old and new instance side by side,
  so budget for twice that against Render's free limit of 50. Before the connection was shared
  it was 29, and overlapping deploys failed their health check on refused connections.
- Free tiers change. Check the current limits when you sign up.

## 1. Supabase (Postgres)

1. New project. Pick the region nearest the Render region in `render.yaml` (Singapore →
   `ap-southeast-1`). Save the database password.
2. **Connect** → **Session pooler** → copy the URI. Use the session pooler, not the direct
   connection (IPv6 only, which Render cannot reach) or the transaction pooler (breaks Prisma
   migrations).
3. Append `?connection_limit=5`. Two apps share the pooler's free connection budget, and
   Prisma's default pool would take more than its share.

```
postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?connection_limit=5
```

The worker queries every minute, which also keeps Supabase from pausing the project for
inactivity.

## 2. Render (api, worker, Redis)

1. **New** → **Blueprint** → connect this repository. Render reads `render.yaml` and proposes the
   `wintel-api` web service and the `wintel-redis` Key Value.
2. Fill in the variables it asks for:

```
DATABASE_URL=<the Supabase string from step 1>
APP_URL=https://wintel.example.com
BETTER_AUTH_URL=https://api.wintel.example.com
AUTH_COOKIE_DOMAIN=.wintel.example.com
CORS_ORIGINS=https://wintel.example.com
RESEND_API_KEY=<key>
SMTP_FROM=Wintel <no-reply@example.com>
```

`BETTER_AUTH_SECRET` is generated for you. Stripe stays `fake` and AI explanations stay off until
you set the real keys (see "Later").

3. Apply. The first build takes several minutes. Every start migrates the database before either
   app runs, so there is no separate migration step.
4. Check `https://wintel-api.onrender.com/api/v1/health` reports database and redis `up`.

Email: verify your sending domain in Resend first. Without working email nobody can finish
signing up.

## 3. Custom domain for the API

1. `wintel-api` → **Settings** → **Custom Domains** → add `api.wintel.example.com`.
2. At your DNS provider: `CNAME` `api.wintel` → `wintel-api.onrender.com`.
3. Render issues the certificate once DNS resolves.

The custom domain is not optional: `onrender.com` is on the Public Suffix List, so a session
cookie cannot be shared between it and Vercel.

## 4. Keep it awake

Create a free monitor (UptimeRobot, or similar) on
`https://api.wintel.example.com/api/v1/health`, every 5 minutes.

## 5. Web app on Vercel

1. **New Project** → import this repository → **Root Directory** `apps/web`.
2. Environment variable `NEXT_PUBLIC_API_URL=https://api.wintel.example.com`. Deploy.
3. **Domains** → add `wintel.example.com`, and at your DNS provider add the `CNAME` Vercel shows.

## 6. Smoke test

Sign up → verify the email → add a website → verify it by DNS → scan it → read the audit.

## Later

- **AI explanations:** set `ANTHROPIC_API_KEY`, `AI_EXPLANATION_PROVIDER=anthropic` and
  `AI_EXPLANATIONS_ENABLED=true` on `wintel-api`.
- **Stripe:** set `STRIPE_PROVIDER=stripe` and all four `STRIPE_*` values, with the webhook at
  `https://api.wintel.example.com/api/v1/billing/webhook`.
- **OAuth:** callbacks at `https://api.wintel.example.com/api/v1/auth/callback/github` and
  `.../google`; set both halves of each pair.
- **Errors:** `SENTRY_DSN`.

Never set a variable to an empty value on Render: the apps treat empty as set, and refuse to boot.

## Outgrowing free

In order of what breaks first:

1. Scans too slow, or the service restarts under load: Render Starter ($7/month) for the
   combined service, or split it back into a web service and a background worker, each built
   from its own Dockerfile.
2. Queue loss on restarts matters: a paid, persistent Key Value.
3. Database over 500 MB: Supabase Pro, or any managed Postgres. Only `DATABASE_URL` changes.
