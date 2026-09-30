# Built with the repo ROOT as context: pnpm workspaces need the lockfile and every workspace
# package present at install time, so an app-scoped context cannot work.
#   docker build -f apps/worker/Dockerfile -t wintel-worker .

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# Prisma's query engine needs OpenSSL; the slim image does not ship it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# `pnpm install` hydrates the whole virtual store from the lockfile whatever it is filtered to, so
# a plain filtered install still drags the web app's Next.js and its platform binaries — most of a
# gigabyte — into a server image. Pruning first writes a lockfile containing only this app's
# closure, which is what keeps the runtime image small.
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.5.8 prune @wintel/worker --docker

FROM base AS build
# The pruned lockfile and workspace file sit beside out/json, not inside it; without them the
# install falls back to the full lockfile and the pruning was for nothing.
COPY --from=prune /app/out/json/ ./
COPY --from=prune /app/out/pnpm-lock.yaml /app/out/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY --from=prune /app/out/full/ ./
# `...` builds the workspace packages this app depends on first, including the Prisma client,
# which is generated rather than committed.
RUN pnpm --filter @wintel/worker... build

FROM base AS prod-deps
COPY --from=prune /app/out/json/ ./
COPY --from=prune /app/out/pnpm-lock.yaml /app/out/pnpm-workspace.yaml ./
COPY --from=prune /app/out/full/packages/database/prisma ./packages/database/prisma
RUN pnpm install --frozen-lockfile --prod
RUN pnpm --filter @wintel/database run db:generate
# better-auth declares Next as an optional peer, and `auto-install-peers` duly installs it along
# with both platform builds of its Rust compiler — 415MB that a server process never imports.
RUN rm -rf node_modules/.pnpm/next@* node_modules/.pnpm/@next+swc*

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages ./packages
COPY --from=prod-deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=prod-deps /app/apps/worker/package.json ./apps/worker/
COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/packages/config/dist ./packages/config/dist
COPY --from=build /app/packages/database/dist ./packages/database/dist
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
WORKDIR /app/apps/worker
# No ingress: the worker only reads queues.
USER node
CMD ["node", "dist/main.js"]
