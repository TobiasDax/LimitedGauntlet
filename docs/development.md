# Development

This page covers building LimitedGauntlet from source and running it locally for development. If you just want to run the app, see the main [`README.md`](../README.md)'s Quick Start (published image) instead — none of this is needed just to deploy.

## Building from source

Only needed if you're modifying the app, or deploying on a platform without a published image.

```sh
git clone https://github.com/TobiasDax/LimitedGauntlet.git
cd LimitedGauntlet
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD and SESSION_SECRET (openssl rand -hex 32)
docker compose up -d --build
```

This builds the same single-image, `db` + `app` Compose stack as the published image — just built locally instead of pulled from GHCR. No manual database setup: migrations apply automatically before the server starts.

## Local development (outside Docker)

For fast iteration on the app itself — hot-reload, no image rebuild per change:

```sh
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD and SESSION_SECRET, as above
docker compose up -d db   # just Postgres, published on localhost:5432 (add a docker-compose.override.yml — see .env.example — since the base file publishes no host port by default)

npm install
npm run dev:server   # Fastify on :8080, loads ../.env for DATABASE_URL etc.
npm run dev:client   # Vite dev server, proxies /api and /socket.io to :8080
```

`npm run prisma:migrate --workspace server` applies schema changes locally against that same Postgres.

## Tests and builds

```sh
npm run --workspace server test   # server unit/integration tests, needs a live Postgres
npm run --workspace server build && npm run --workspace client build   # typecheck + build both
```

Server tests run against a real Postgres, not a mocked database — pairing, standings, and other business-rule logic is verified against actual query results. The client has no separate test framework; UI changes are verified by hand against a running instance.
