# The api and worker in ONE image, for hosts whose free tier allows a single always-on service
# (Render). Each app keeps its own Dockerfile for hosts that can run them apart; this one exists
# only to fit both into one container. Built with the repo ROOT as context:
#   docker build -f deploy/render/Dockerfile -t wintel-server .

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# Prisma's query engine needs OpenSSL; the slim image does not ship it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# One pruned lockfile covering both apps' closures. See apps/api/Dockerfile for why pruning.
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.5.8 prune @wintel/api @wintel/worker --docker

FROM base AS build
COPY --from=prune /app/out/json/ ./
COPY --from=prune /app/out/pnpm-lock.yaml /app/out/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY --from=prune /app/out/full/ ./
RUN pnpm --filter @wintel/api... --filter @wintel/worker... build

FROM base AS prod-deps
COPY --from=prune /app/out/json/ ./
COPY --from=prune /app/out/pnpm-lock.yaml /app/out/pnpm-workspace.yaml ./
COPY --from=prune /app/out/full/packages/database/prisma ./packages/database/prisma
RUN pnpm install --frozen-lockfile --prod
RUN pnpm --filter @wintel/database run db:generate
# better-auth's optional Next peer; see apps/api/Dockerfile.
RUN rm -rf node_modules/.pnpm/next@* node_modules/.pnpm/@next+swc*

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages ./packages
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /app/apps/api/package.json ./apps/api/
COPY --from=prod-deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=prod-deps /app/apps/worker/package.json ./apps/worker/
COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/packages/config/dist ./packages/config/dist
COPY --from=build /app/packages/database/dist ./packages/database/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY deploy/render/start.sh /app/start.sh
USER node
EXPOSE 4000
CMD ["/app/start.sh"]
