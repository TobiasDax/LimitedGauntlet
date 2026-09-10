# syntax=docker/dockerfile:1

FROM node:22-slim AS base
RUN apt-get update -qq \
  && apt-get install -y -qq --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

FROM deps AS client-build
COPY client client
RUN npm run build --workspace client

FROM deps AS server-build
COPY server server
RUN npm run prisma:generate --workspace server
RUN npm run build --workspace server

FROM base AS runtime
ENV NODE_ENV=production
# No Prisma CLI version-check phone-home on boot, and keep any stray cache
# writes inside a writable tmpfs so the container can run read-only.
ENV CHECKPOINT_DISABLE=1
ENV XDG_CACHE_HOME=/tmp
# Everything is owned by the built-in unprivileged `node` user (uid 1000) so
# the container never runs as root — see USER below. `COPY --chown` sets
# ownership as it copies (one layer, no size cost).
COPY --from=server-build --chown=node:node /app/node_modules node_modules
COPY --from=deps --chown=node:node /app/package.json package.json
COPY --chown=node:node server/package.json server/package.json
COPY --from=server-build --chown=node:node /app/server/dist server/dist
COPY --from=server-build --chown=node:node /app/server/prisma server/prisma
COPY --from=client-build --chown=node:node /app/client/dist client/dist
COPY --chown=node:node docker/entrypoint.sh entrypoint.sh
COPY --chown=node:node docker/preflight.cjs preflight.cjs
RUN chmod +x entrypoint.sh

USER node
EXPOSE 8080
ENTRYPOINT ["./entrypoint.sh"]
