# LimitedGauntlet

A self-hosted, open-source Swiss-tournament tracker for MTG Limited (and other) events. Built to replace a third-party pairing site plus a pile of manually-maintained docs for a yearly ~8-10 player weekend GP — pairing, results, live standings, a round timer, and card-pull value tracking, all in one app.

Designed from day one as a real multi-group tool: one deployment can host several isolated organizations, each with their own login and player roster.

**Status: active build, not yet feature-complete.** The full backend is built and tested end-to-end: auth/multi-tenancy, tournament/pod/entrant CRUD, Swiss pairing with weekend-wide repeat avoidance, standings, Gesamtwertung, realtime broadcasts, and Scryfall-backed value tracking. The frontend is under active construction — auth, roster management, and pod/entrant setup are working (dark-mode-only for v1, light mode is a deliberate v2); the flagship pages (Gesamtwertung, standings, live pairings + round timer) and value-tracking UI are next. See [`STEPS.md`](STEPS.md) for exactly what's done and what's next, and [`PLAN.md`](PLAN.md) for the full design rationale.

## Stack

Node.js + TypeScript throughout — Fastify + Prisma + PostgreSQL on the backend, React + Vite + Tailwind on the frontend, Socket.IO for realtime. Ships as a single Docker image plus a Postgres container; migrations run automatically on startup.

## Running it

```sh
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD and SESSION_SECRET (openssl rand -hex 32)
docker compose up -d
```

The app comes up on `http://localhost:8080` (configurable via `PORT` in `.env`). No manual database setup — migrations apply automatically before the server starts.

## Development

```sh
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD and SESSION_SECRET, as above
docker compose up -d db   # just Postgres, published on localhost:5432

npm install
npm run dev:server   # Fastify on :8080, loads ../.env for DATABASE_URL etc.
npm run dev:client   # Vite dev server, proxies /api and /socket.io to :8080
```

`npm run prisma:migrate --workspace server` applies schema changes locally against that same Postgres.

## License

Not yet decided — defaulting to MIT unless there's a reason to prefer AGPL (see `PLAN.md`, Step 11).
