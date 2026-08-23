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
COPY --from=server-build /app/node_modules node_modules
COPY --from=deps /app/package.json package.json
COPY server/package.json server/package.json
COPY --from=server-build /app/server/dist server/dist
COPY --from=server-build /app/server/prisma server/prisma
COPY --from=client-build /app/client/dist client/dist
COPY docker/entrypoint.sh entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["./entrypoint.sh"]
