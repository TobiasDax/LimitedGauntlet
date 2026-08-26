# Deployment guide

A general guide for running LimitedGauntlet on your own server — any Docker host works, this isn't tied to any particular provider or reverse proxy. If you're deploying to a specific setup with its own conventions, this is the doc to follow; host-specific runbooks (if any) live alongside it and layer a handful of extra steps on top rather than repeating this one.

## Prerequisites

- Docker + Docker Compose (v2, the `docker compose` subcommand — not the old standalone `docker-compose`)
- Nothing else. Postgres runs in its own container; there's no separate database to provision.

## 1. Get the app

Two ways to run it — pick one:

**Option A: published image (recommended).** No git clone, no build step — just a Compose file and a `.env`.

```sh
mkdir limitedgauntlet && cd limitedgauntlet
curl -O https://raw.githubusercontent.com/TobiasDax/LimitedGauntlet/main/docker-compose.image.yml
mv docker-compose.image.yml docker-compose.yml
curl -O https://raw.githubusercontent.com/TobiasDax/LimitedGauntlet/main/.env.example
```

Images are published to GHCR on every tagged release. The example file defaults to `:latest`; pin a specific version tag instead (e.g. `ghcr.io/tobiasdax/limitedgauntlet:0.1.0`) if you'd rather upgrade deliberately than automatically — see the comments in `docker-compose.image.yml` itself.

**Option B: build from source.** Only worth it if you're modifying the app yourself, or on a platform without a published image.

```sh
git clone <your-fork-or-this-repo-url> limitedgauntlet
cd limitedgauntlet
```

The rest of this guide applies to either option — just substitute the right `docker compose` invocation in step 3 (called out there).

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

Published image (Option A):

```sh
docker compose up -d
```

Built from source (Option B):

```sh
docker compose up -d --build
```

Migrations run automatically on container start (`docker/entrypoint.sh` runs `prisma migrate deploy` before the server boots) — there's no manual database setup step, ever, including after an update that brings in new migrations.

The app is now reachable at `http://<host>:8080` (or whatever `PORT` you set in `.env`).

**Postgres has no published port by default** — the app container reaches `db` over the internal Compose network regardless, and nothing about a normal deployment needs `5432` reachable from outside Docker. If you're doing local (non-Docker) development with `npm run dev:server`, which does need to reach it directly, see the **Updating** section below for how to add that back via a `docker-compose.override.yml` without editing the tracked file.

## 4. Exposure

The app has no built-in reverse proxy or TLS termination — how it's reached is entirely up to your own infrastructure, not something baked into the repo. A few common patterns, in rough order of setup effort:

- **LAN only, no proxy**: nothing further needed — reachable at `http://<host-ip>:8080` as-is. Fine for a private homelab tournament tracker nobody outside the LAN needs to hit.
- **A reverse proxy you already run** (Nginx, Caddy, Traefik, NPM, etc.): point a `server`/`site`/router block at `http://<host>:8080`, terminate TLS there, and set `SESSION_COOKIE_SECURE=true` once it's live behind HTTPS. The app doesn't care which proxy you use — it's a plain HTTP + WebSocket (Socket.IO) backend on one port.
- **A mesh VPN** (Tailscale, WireGuard, etc.): expose the container's port through whatever mechanism your mesh provides (Tailscale Serve, a sidecar proxy, etc.) rather than opening it to the public internet at all.

Socket.IO (used for live pairings/standings/timer updates) shares the same port and path prefix as the rest of the API — no separate WebSocket configuration is needed beyond whatever your proxy needs to pass `Upgrade`/`Connection` headers through for WebSocket traffic (most reverse proxies do this by default for HTTP/1.1 upstreams; check your proxy's docs if realtime updates aren't arriving).

## 5. Optional: import past tournament history

If you're migrating from spreadsheets, a pairing site, or manually-kept docs and want your past results pre-loaded rather than starting from an empty roster, see the README's **History import** section — it covers the data file format, the idempotent import script, and the env vars that control the created organization/login. Turning your actual records into that file's exact JSON shape is the tedious part; if you're running this via Claude Code, the [`import-history`](../.claude/skills/import-history/SKILL.md) skill (`/import-history`) does that conversion interactively instead of you hand-writing it against the TypeScript interfaces.

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

## 8. Optional: SSO login via OIDC

Organizers can sign in through an external identity provider (Authelia, Keycloak, Authentik, Google, etc.) instead of (or alongside) an email + password. It's off unless configured — the app runs password-only until you set the OIDC env vars, and the "Sign in with…" button simply isn't shown.

Set these in `.env` (one provider per deployment):

```sh
OIDC_ISSUER=https://auth.example.com          # provider base URL; discovery at <issuer>/.well-known/openid-configuration
OIDC_CLIENT_ID=limited-gauntlet
OIDC_CLIENT_SECRET=…
OIDC_REDIRECT_URI=                             # optional; defaults to <APP_BASE_URL>/api/auth/oidc/callback
OIDC_PROVIDER_NAME=Authelia                    # button label: "Sign in with Authelia"
OIDC_SCOPE=openid email profile               # must include openid + email
```

Register the redirect URI (`<APP_BASE_URL>/api/auth/oidc/callback`) at your provider, and make sure `APP_BASE_URL` is set so links resolve. An SSO login resolves in this order:

1. **Existing organizer account with a matching verified email** → linked and logged in.
2. **A pending co-organizer invite** (Settings → Organizers) for that email → a passwordless account is provisioned into that org.
3. **A brand-new identity, when `ALLOW_SIGNUP=true`** → the user is dropped on a one-time **org-setup screen** to name their new organization, then logged in. (With `ALLOW_SIGNUP=false`, an unknown SSO identity is refused — invite them first.)

An SSO-provisioned account has no local password; it can set one from **Settings → Account** if it also wants password login.

### SSO-only mode

To make OIDC the *only* way in, set `LOCAL_LOGIN_DISABLED=true`. This hides the password form + local signup and rejects `POST /api/auth/login` / local signup — everyone logs in via SSO (existing accounts link by email; new ones self-register through the org-setup screen when signups are open). As a fail-safe it's **ignored unless OIDC is configured**, so a typo can't lock you out of the app entirely.

## Updating

**Published image (Option A):**

```sh
docker compose pull
docker compose up -d
```

If `docker-compose.image.yml` pins a specific version tag, bump it in your `docker-compose.yml` first (check the [Releases page](https://github.com/TobiasDax/LimitedGauntlet/releases) for the latest), then run the above. On `:latest`, the `pull` alone picks up the newest published image.

**Built from source (Option B):**

```sh
git status                    # see below if this isn't clean
git pull
docker compose up -d --build
```

That's it for the common case. A few things worth knowing:

**Migrations apply automatically, same as first boot.** The container runs `prisma migrate deploy` before the server starts, every time it (re)starts — so an update that brings in new migrations needs no separate step, on either option. Migrations only ever go forward: there's no automatic rollback. If you need to undo a schema change after the fact, that's a manual Prisma operation (or restoring a database backup) — reason enough to have a recent backup before updating, same as before any schema-changing update to anything.

**If you've customized `docker-compose.yml` locally** (Option B — e.g. wiring in your own reverse-proxy labels, or re-publishing the Postgres port for local dev), `git pull` can conflict if a future update also touches that file — Git will refuse to overwrite your uncommitted changes rather than silently discarding them, so check `git status` before pulling if you're not sure. The cleaner long-term fix: put your local customizations in a `docker-compose.override.yml` file instead of editing `docker-compose.yml` directly. (Option A doesn't have this problem — there's no tracked file to conflict with; just edit your own `docker-compose.yml` directly.) Compose automatically merges `docker-compose.override.yml` on top of `docker-compose.yml` (no extra flag needed — `docker compose up` picks it up by itself), so your customizations live in a file `git pull` never touches at all, no matter how much the base file changes upstream. Example, re-publishing the Postgres port for local (non-Docker) development this way instead of editing the base file:

```yaml
# docker-compose.override.yml — not tracked by this repo's git history,
# keep your own copy of this file outside of `git pull`'s reach.
services:
  db:
    ports:
      - "5432:5432"
```

(Compose's merge rule for list-type fields like `ports` is additive, not a replacement — there's no equivalent override for *removing* an entry the base file already declares. Not a concern here since the base file publishes no ports on `db` to begin with; only relevant if you're overriding something the base file does declare.)

**Expect a brief restart, not downtime for the whole stack.** `docker compose up -d --build` only rebuilds and recreates the `app` service (unless the update touched `docker-compose.yml`'s `db` config, which is rare) — `db` and its data volume are untouched, so there's no data-loss risk from an update itself. The app container will be briefly unreachable while it restarts (typically a few seconds).

**Verify it actually came back up:**

```sh
docker compose logs -f app   # watch for startup errors, Ctrl-C once it looks healthy
curl http://localhost:8080/api/healthz   # expect {"status":"ok"}
```
