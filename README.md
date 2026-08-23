# LimitedGauntlet

A self-hosted, open-source Swiss-tournament tracker for MTG Limited (and other) events. Built to replace a third-party pairing site plus a pile of manually-maintained docs for a yearly ~8-10 player weekend GP — pairing, results, live standings, a round timer, and card-pull value tracking, all in one app.

Designed from day one as a real multi-group tool: one deployment can host several isolated organizations, each with their own login and player roster.

**Status: early build, not yet usable.** The backend (auth, multi-tenancy, tournament/pod/entrant CRUD) works and is tested end-to-end; there's no pairing engine, results, standings, or frontend UI yet beyond a placeholder page. See [`STEPS.md`](STEPS.md) for exactly what's done and what's next, and [`PLAN.md`](PLAN.md) for the full design rationale.

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
npm install
npm run dev:server   # Fastify on :8080
npm run dev:client   # Vite dev server, proxies /api and /socket.io to :8080
```

Needs a running Postgres reachable via `DATABASE_URL` (see `server/prisma/schema.prisma`). `npm run prisma:migrate --workspace server` applies schema changes locally.

## License

Not yet decided — defaulting to MIT unless there's a reason to prefer AGPL (see `PLAN.md`, Step 11).
