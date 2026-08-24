# LimitedGauntlet

A self-hosted, open-source Swiss-tournament tracker for MTG Limited (and other) events. Built to replace a third-party pairing site plus a pile of manually-maintained docs for a yearly ~8-10 player weekend GP — pairing, results, live standings, a round timer, card-pull value tracking, and a shareable public view, all in one app.

Designed from day one as a real multi-group tool: one deployment can host several isolated organizations, each with their own login and player roster.

![Gesamtwertung — the weekend-wide standings page, average-ranked with per-pod pips](docs/screenshots/gesamtwertung.png)

**Status: feature-complete, pre-deploy.** Auth/multi-tenancy, tournament/pod/entrant CRUD, Swiss pairing with weekend-wide repeat avoidance, standings, Gesamtwertung, realtime broadcasts (Socket.IO), a round timer with a Display Mode chime, Scryfall-backed value tracking, public read-only pages, and a full responsive pass are all built, browser-tested, and — for the screenshot above — running against 4 real years of imported tournament history. Dark mode only for v1 (light mode is a deliberate v2, not an oversight). What's left is packaging polish and the actual deploy. See [`STEPS.md`](STEPS.md) for the detailed build log and [`PLAN.md`](PLAN.md) for the full design rationale.

## Stack

Node.js + TypeScript throughout — Fastify + Prisma + PostgreSQL on the backend, React + Vite + Tailwind on the frontend, Socket.IO for realtime. Ships as a single Docker image plus a Postgres container; migrations run automatically on startup.

## Running it

```sh
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD and SESSION_SECRET (openssl rand -hex 32)
docker compose up -d
```

The app comes up on `http://localhost:8080` (configurable via `PORT` in `.env`). No manual database setup — migrations apply automatically before the server starts.

For a real deployment (production hardening, reverse proxy / TLS exposure options, updating), see [`docs/deployment.md`](docs/deployment.md).

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

## History import

`server/src/scripts/import-legacy.ts` reads a JSON file of past tournament history — names, pods, points, card pulls — and inserts it via Prisma. It's idempotent (safe to re-run, existing rows are left alone rather than duplicated) and never goes through the HTTP API.

**The data file is not part of this repo.** Real tournament history is real people's names and results, and doesn't belong in a git history — even a private one. Supply your own as `legacy-data.local.json` at the repo root (gitignored) matching the shape in `server/src/scripts/import-legacy.ts`'s `LegacyData` interface, or point at a file anywhere else:

```sh
docker compose exec app node server/dist/scripts/import-legacy.js /path/to/your-data.json
# or: LEGACY_DATA_PATH=/path/to/your-data.json docker compose exec app node server/dist/scripts/import-legacy.js
```

Creates an organization (`gp-eichstaett` by default) and one organizer login. Set these first if you want anything other than the generated defaults:

```sh
IMPORT_ORG_SLUG=gp-eichstaett
IMPORT_ORG_NAME="GP Eichstätt"
IMPORT_ORGANIZER_EMAIL=organizer@example.com
IMPORT_ORGANIZER_PASSWORD=              # generated + printed once if left unset — log in and change it
IMPORT_ORGANIZER_NAME=Organizer
```

The JSON has its own data source note worth reading before trusting it blindly: names were reconciled across years where a document used a nickname/surname/typo, and exact calendar dates aren't recorded in the original source (marked `dateApproximate`, easy to fix later via the tournament's own settings).

## API tokens & MCP server

The app exposes an MCP (Model Context Protocol) server (`mcp/`) so an AI agent can read and manage tournament data — pairing, results, standings, card pulls — through the same authenticated API the web app uses, rather than the database directly. Mint a bearer token from **API Tokens** in the top nav (shown once, revoke any time from the same page), then see [`mcp/README.md`](mcp/README.md) for how to run the server and point an MCP client at it. Destructive operations (deleting a tournament/pod/entrant, removing a card pull) require a two-step confirmation in the tool layer, independent of whatever confirmation the MCP client itself also does.

## License

[MIT](LICENSE).
