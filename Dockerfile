# syntax=docker/dockerfile:1.7
FROM node:22.23.2-bookworm-slim AS runtime-base
WORKDIR /app
RUN apt-get update && apt-get install --yes --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

FROM runtime-base AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# corepack install reads the pinned version from "packageManager" and caches
# both the launcher and the native pnpm binary in this layer, so later stages
# reuse them instead of downloading pnpm again.
RUN corepack enable
COPY package.json ./
RUN corepack install && pnpm --version

FROM base AS dependencies
ENV NODE_ENV=development
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts

FROM dependencies AS build
ENV NODE_ENV=development
COPY tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN pnpm rebuild && pnpm db:generate && pnpm build

FROM build AS migration
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

FROM base AS production-dependencies
ENV NODE_ENV=production
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile --ignore-scripts

FROM runtime-base AS runtime
ENV NODE_ENV=production SERVER_HOST=0.0.0.0 SERVER_PORT=3001
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
