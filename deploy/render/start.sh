#!/usr/bin/env bash
# Migrates, then runs the api and worker side by side. Render's free tier has no pre-deploy step,
# so migrating here is the only way the schema is current before either app starts; with a single
# instance nothing races it.
set -euo pipefail

node /app/packages/database/node_modules/prisma/build/index.js migrate deploy \
  --schema=/app/packages/database/prisma/schema.prisma

# Each process sizes its heap as if it had the whole container. Two of them in 512 MB need a cap,
# or both grow until the container is killed.
HEAP="--max-old-space-size=${HEAP_MB:-192}"

pids=()
(cd /app/apps/api && exec node "$HEAP" dist/main.js) &
pids+=($!)
(cd /app/apps/worker && exec node "$HEAP" dist/main.js) &
pids+=($!)

# A deploy or restart sends SIGTERM to this script; pass it on and wait, so both apps finish their
# shutdown hooks (in-flight jobs, open connections) before the container goes.
trap 'kill -TERM "${pids[@]}" 2>/dev/null || true; wait; exit 0' TERM INT

# If either app dies, exit so the platform restarts the container, rather than serving an api
# whose jobs nobody processes, or a worker behind an api that is gone.
wait -n
