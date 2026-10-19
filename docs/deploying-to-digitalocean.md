# Deploying to a DigitalOcean droplet, with the web app on Vercel

The api, worker, Postgres and Redis run on one droplet that already hosts other apps; the web app
runs on Vercel. The droplet stack lives in `deploy/droplet/`. For the same deploy on Railway, see
`deploying-to-railway.md`.

## Before you start

**You need a custom domain.** The API sets the session cookie, and the browser only sends it back
from the web app if both share a registrable domain. `*.vercel.app` is on the Public Suffix List,
so a Vercel hostname and a droplet hostname never share one. This runbook uses `example.com` for
the web app and `api.example.com` for the API.

**Check the droplet has room.** Idle, this stack uses about 200 MB; under scan load expect 500 to
700 MB, and the compose file caps it at about 1.4 GB. On the droplet:

```
free -h
docker stats --no-stream
```

1 GB total will swap; 2 GB or more is comfortable. If memory is tight, add swap before anything
else, or Postgres and the existing apps will be OOM-killed under load:

```
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

**Images are built by CI, not on the droplet.** Each push to `main` publishes
`ghcr.io/maumaun30/wintel-api` and `wintel-worker`, tagged `latest` and with the commit SHA.
Building on the droplet works (`docker compose build`) but the TypeScript builds want more memory
than a small droplet shared with other apps should give them.

## 1. DNS

- `api.example.com`: an `A` record to the droplet's IP.
- `example.com`: whatever Vercel tells you in step 5 (an `A` record to `76.76.21.21` for an apex).

## 2. Put the stack on the droplet

```
git clone https://github.com/maumaun30/website-intelligence-platform.git /opt/wintel
cd /opt/wintel/deploy/droplet
cp .env.example .env
chmod 600 .env
```

Fill in `.env`. Everything in it is described there; the ones you must generate:

```
openssl rand -hex 24        # POSTGRES_PASSWORD
openssl rand -base64 32     # BETTER_AUTH_SECRET
```

If something on the droplet already listens on port 4000, set `API_HOST_PORT` to a free one.

GHCR packages start private, even for a public repository. Either make both packages public on
GitHub (Package settings → Change visibility), or log in on the droplet with a personal access
token that has only `read:packages`:

```
echo <token> | docker login ghcr.io -u maumaun30 --password-stdin
```

## 3. Start it

```
docker compose pull
docker compose up -d
docker compose ps
```

`migrate` runs first and should show `exited (0)`; the api and worker start only after it. Check
the API answers on loopback:

```
curl -s localhost:4000/api/v1/health
```

Nothing is reachable from outside yet, which is intended: Postgres and Redis publish no ports at
all, and the API listens on `127.0.0.1` only.

## 4. Reverse proxy and TLS

Use whatever already fronts the other apps on the droplet. Either way, forward
`api.example.com` to `127.0.0.1:4000`.

**nginx** (`/etc/nginx/sites-available/wintel-api`, then link it into `sites-enabled`):

```nginx
server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```
nginx -t && systemctl reload nginx
certbot --nginx -d api.example.com
```

**Caddy** (TLS is automatic):

```
api.example.com {
    reverse_proxy 127.0.0.1:4000
}
```

If the existing proxy itself runs in a container, `127.0.0.1` there is the proxy's own loopback,
not the host's. Attach the api service to the proxy's Docker network instead and proxy to
`api:4000`.

## 5. The web app on Vercel

1. New project → import this repository.
2. **Root Directory:** `apps/web`. Vercel detects Next.js, and installs from the repository root
   because of the pnpm workspace.
3. **Environment variable:** `NEXT_PUBLIC_API_URL=https://api.example.com`, for Production. Next
   inlines it at build time, so changing it needs a redeploy.
4. **Domains:** add `example.com` and set the DNS record Vercel shows.

`output: 'standalone'` in `next.config.ts` is for the container image; Vercel ignores it.

## 6. Stripe, smoke test, OAuth

Same as the Railway runbook from step 6 on: create the Stripe webhook against
`https://api.example.com/api/v1/billing/webhook`, run the smoke test in order, and only then add
the OAuth apps. After any change to `.env`:

```
docker compose up -d
```

## Updating

```
cd /opt/wintel && git pull          # only needed when deploy/droplet/ itself changed
cd deploy/droplet
docker compose pull && docker compose up -d
docker image prune -f
```

To roll back, set `IMAGE_TAG` in `.env` to an earlier commit SHA and run the same `pull` and
`up -d`. Migrations only go forward, so rolling back past a migration needs the schema change
undone by hand first.

## Backups

Nothing backs up this Postgres unless you set it up. A nightly dump, keeping a week:

```
mkdir -p /var/backups/wintel
crontab -e
```

```
0 3 * * * cd /opt/wintel/deploy/droplet && docker compose exec -T postgres pg_dump -U wintel -Fc wintel > /var/backups/wintel/wintel-$(date +\%F).dump && find /var/backups/wintel -name '*.dump' -mtime +7 -delete
```

A dump on the same droplet does not survive losing the droplet. Copy them off it (DigitalOcean
Spaces with `s3cmd`, or droplet backups) once there is data worth keeping.

Restore:

```
docker compose exec -T postgres pg_restore -U wintel -d wintel --clean < /var/backups/wintel/wintel-YYYY-MM-DD.dump
```

## Logs

```
docker compose logs -f api worker
```

Docker's default log driver keeps everything forever. If `/etc/docker/daemon.json` does not
already cap it, add `{"log-driver": "local"}` and restart Docker, or the logs will eventually fill
the disk.
