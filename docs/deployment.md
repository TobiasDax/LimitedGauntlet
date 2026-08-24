# Deployment guide

A general guide for running LimitedGauntlet on your own server — any Docker host works, this isn't tied to any particular provider or reverse proxy. If you're deploying to a specific setup with its own conventions, this is the doc to follow; host-specific runbooks (if any) live alongside it and layer a handful of extra steps on top rather than repeating this one.

## Prerequisites

- Docker + Docker Compose (v2, the `docker compose` subcommand — not the old standalone `docker-compose`)
- Nothing else. Postgres runs in its own container; there's no separate database to provision.

## 1. Get the code

```sh
git clone <your-fork-or-this-repo-url> limitedgauntlet
cd limitedgauntlet
```

## 2. Configure `.env`

```sh
cp .env.example .env
```

Set at minimum:

- `POSTGRES_PASSWORD` — a real secret, not the placeholder
- `SESSION_SECRET` — a 32-byte hex string: `openssl rand -hex 32`. The app fails to start without this, deliberately — no silent insecure default.
- `SESSION_COOKIE_SECURE` — `true` once you're behind a TLS-terminating reverse proxy (see step 4); leave `false` for plain HTTP (LAN-only or local testing). A `true` value on plain HTTP silently breaks login, since the browser won't send a `Secure` cookie back over an insecure connection — if login redirects you straight back to the login page after a successful sign-in, check this first.

Everything else in `.env.example` has a working default.

## 3. First boot

```sh
docker compose up -d --build
```

Migrations run automatically on container start (`docker/entrypoint.sh` runs `prisma migrate deploy` before the server boots) — there's no manual database setup step, ever, including after a `git pull` that brings in new migrations.

The app is now reachable at `http://<host>:8080` (or whatever `PORT` you set in `.env`).

**Production hardening — drop the Postgres port publish.** The repo's `docker-compose.yml` publishes the `db` service on `5432:5432` so `npm run dev:server` can reach it directly from outside Docker during local development. On a live deployment, nothing needs that — the app container talks to `db` over the internal Compose network regardless. Leaving it published needlessly widens the attack surface (anyone who can reach the host on port 5432 can attempt to connect to Postgres). Before going live, either delete that `ports:` mapping from `docker-compose.yml`, or bind it to localhost only (`127.0.0.1:5432:5432`) if you still want host-side access for occasional debugging.

## 4. Exposure

The app has no built-in reverse proxy or TLS termination — how it's reached is entirely up to your own infrastructure, not something baked into the repo. A few common patterns, in rough order of setup effort:

- **LAN only, no proxy**: nothing further needed — reachable at `http://<host-ip>:8080` as-is. Fine for a private homelab tournament tracker nobody outside the LAN needs to hit.
- **A reverse proxy you already run** (Nginx, Caddy, Traefik, NPM, etc.): point a `server`/`site`/router block at `http://<host>:8080`, terminate TLS there, and set `SESSION_COOKIE_SECURE=true` once it's live behind HTTPS. The app doesn't care which proxy you use — it's a plain HTTP + WebSocket (Socket.IO) backend on one port.
- **A mesh VPN** (Tailscale, WireGuard, etc.): expose the container's port through whatever mechanism your mesh provides (Tailscale Serve, a sidecar proxy, etc.) rather than opening it to the public internet at all.

Socket.IO (used for live pairings/standings/timer updates) shares the same port and path prefix as the rest of the API — no separate WebSocket configuration is needed beyond whatever your proxy needs to pass `Upgrade`/`Connection` headers through for WebSocket traffic (most reverse proxies do this by default for HTTP/1.1 upstreams; check your proxy's docs if realtime updates aren't arriving).

## 5. Optional: import past tournament history

If you're migrating from spreadsheets, a pairing site, or manually-kept docs and want your past results pre-loaded rather than starting from an empty roster, see the README's **History import** section — it covers the data file format, the idempotent import script, and the env vars that control the created organization/login.

## 6. Optional: mint an API token for the MCP server

The app exposes an MCP (Model Context Protocol) server (`mcp/`) so an AI agent can read and manage tournament data directly — pairing, results, standings, card pulls — through the same authenticated API the web app uses. This is entirely optional and runs as a separate local process, not part of the deployed container.

1. Log into the app, open **API Tokens** (top-right nav), and mint a token — it's shown once, copy it immediately.
2. See `mcp/README.md` for how to build and run the MCP server, and how to point an MCP-compatible client (Claude Desktop, Claude Code, etc.) at it.

Treat the token like a password — it grants the same access as the organizer who minted it. Revoke it from the same page if it's ever exposed.

## 7. Optional: backfill inferred card-pull attribution

If you have card pulls logged from before per-player attribution existed (or before you started using the "Pulled by" field when adding a pull), a one-time script will guess attribution for already-completed pods using a simple heuristic — top-3 finishers matched to the top-3 most valuable pulls in that pod, above a price floor. Every guess is marked as inferred and reviewable/reassignable from the pod's Value tab; nothing it writes is treated as final until a human confirms it.

```sh
docker compose exec app node server/dist/scripts/infer-existing-card-pulls.js
```

Safe to re-run — it's idempotent and never overwrites an attribution a human has already set or confirmed.

## Updating

```sh
git pull
docker compose up -d --build
```

New migrations apply automatically on the next container start, same as first boot. There's no separate migration step to remember.
