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

Everything else in `.env.example` has a working default, including `TRUSTED_PROXIES` (blank — direct/LAN mode). See section 4 below before you decide how the app will actually be reached: the default Compose files ship with no host port published and no bundled reverse proxy or tunnel, so you need to add one via an override before the app is reachable at all.

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

The app has no host-published port and no bundled reverse proxy or tunnel in this default topology — it isn't reachable from outside the Compose project until you add one (see section 4).

**Postgres has no published port by default** — the app container reaches `db` over the internal Compose network regardless, and nothing about a normal deployment needs `5432` reachable from outside Docker. If you're doing local (non-Docker) development with `npm run dev:server`, which does need to reach it directly, see the **Updating** section below for how to add that back via a `docker-compose.override.yml` without editing the tracked file.

## 4. Exposure and alternatives

The shipped Compose files deliberately define no ingress at all — no published host port, no bundled reverse proxy or tunnel — so pick one of these and add it via a local `docker-compose.override.yml` (keeps the tracked file untouched):

- **LAN only, no proxy**: add `services: { app: { ports: ["8080:8080"] } }`. Leave `TRUSTED_PROXIES` blank and `SESSION_COOKIE_SECURE=false`. Forwarding headers are ignored, so clients cannot rotate authentication rate-limit buckets by spoofing them.
- **A reverse proxy or tunnel you already run** (Cloudflare Tunnel, Nginx, Caddy, Traefik, NPM, etc.) — including one that lives in its own separate Compose project rather than this one: connect it to the app container over a private Docker network (an `external: true` network both Compose projects join, or by attaching the proxy's container to this project's `egress` network) and set `TRUSTED_PROXIES` to its exact container IP (or the narrowest dedicated CIDR). Do not use `true`, `*`, a hop count, or an entire shared RFC1918 range. The proxy must replace client-supplied `X-Forwarded-For`, `X-Forwarded-Host`, and `X-Forwarded-Proto` values rather than blindly preserving them. Set `SESSION_COOKIE_SECURE=true` behind HTTPS.
- **A mesh VPN** (Tailscale, WireGuard, etc.): expose the container's port through whatever mechanism your mesh provides (Tailscale Serve, a sidecar proxy, etc.) rather than opening it to the public internet at all.

Socket.IO (used for live pairings/standings/timer updates) shares the same port and path prefix as the rest of the API — no separate WebSocket configuration is needed beyond whatever your proxy needs to pass `Upgrade`/`Connection` headers through for WebSocket traffic (most reverse proxies do this by default for HTTP/1.1 upstreams; check your proxy's docs if realtime updates aren't arriving).

## 5. Optional: import past tournament history

If you're migrating from spreadsheets, a pairing site, or manually-kept docs and want your past results pre-loaded rather than starting from an empty roster, see the README's **History import** section — it covers the data file format, the idempotent import script, and the env vars that control the created organization/login. Turning your actual records into that file's exact JSON shape is the tedious part; if you're running this via Claude Code, the [`import-history`](../.claude/skills/import-history/SKILL.md) skill (`/import-history`) does that conversion interactively instead of you hand-writing it against the TypeScript interfaces.

## 5b. Optional: player self-service accounts

By default an organizer runs everything. If you'd rather let players check
themselves into tournaments and report their own match results, invite them
from **Roster** — pick a player, enter their email, and hand them the link
(it's also emailed automatically when SMTP is configured — see §2). They set a
password and sign in at `/o/<your-slug>/player`.

This is a separate, opt-in login that never gates the public pages — a player
account only unlocks that player's own writes. A signed-in player can also
view your org's pages even when you've set a public-page password (§ PI-27),
since they've already authenticated. Revoke an account any time from Roster;
that immediately invalidates their session.

## 5c. Optional: tokens (a player prize-wall currency)

**Settings → Tokens** turns on an org-wide player currency: players accumulate
"tokens" for playing in pods and for their finishing place, redeemable at a
prize wall you run outside this app. Set the default reward values on each
tournament (participation + a place→bonus list), overridable per pod. Organizers
adjust balances (add / deduct / set) from the Tokens tab on a player's page;
the balance is public, the transaction ledger is organizer-only (and visible to
a player logged into their own account). Off by default — turning it on
backfills tokens for every already-completed pod using the current config.

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

## 8. Optional: SSO login (OIDC, Google, Discord)

Organizers can sign in through an external provider instead of (or alongside) an
email + password. Up to three are supported, each independently optional — the
app runs password-only until you configure one, and only configured providers
get a button.

Make sure `APP_BASE_URL` is set (it's used to build the redirect URIs and email
links). All three feed the **same account rules** (see "resolution order" below).

### Generic OIDC (Authelia, Keycloak, Authentik, Pocket ID, …)

```sh
OIDC_ISSUER=https://auth.example.com          # provider base URL; discovery at <issuer>/.well-known/openid-configuration
OIDC_CLIENT_ID=limited-gauntlet
OIDC_CLIENT_SECRET=…
OIDC_REDIRECT_URI=                             # optional; defaults to <APP_BASE_URL>/api/auth/oidc/callback
OIDC_PROVIDER_NAME=Authelia                    # button label: "Sign in with Authelia"
OIDC_SCOPE=openid email profile               # must include openid + email
```

Register the redirect URI `<APP_BASE_URL>/api/auth/oidc/callback` at your provider.

### Google and Discord

Full console walkthrough (OAuth consent screen, test users vs. publishing,
redirect-URI exact-match rules, troubleshooting) is in
[`sso-google-discord.md`](sso-google-discord.md). The short version:

- **Google** — Google Cloud Console → configure the OAuth consent screen, then
  **Credentials → Create OAuth client ID → Web application**, authorized redirect
  URI `<APP_BASE_URL>/api/auth/sso/google/callback`.
- **Discord** — Discord Developer Portal → **New Application → OAuth2**, add
  redirect `<APP_BASE_URL>/api/auth/sso/discord/callback` (the app requests the
  `identify` + `email` scopes at login).

```sh
GOOGLE_CLIENT_ID=…apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=…
DISCORD_CLIENT_ID=…
DISCORD_CLIENT_SECRET=…
```

A Discord account whose email isn't verified on Discord's side can't be matched
(the login shows "your identity provider didn't share a verified email").

### Resolution order

An SSO login resolves the same way for every provider:

1. **A previously linked identity** → logged straight in.
2. **An existing organizer account with the same verified email** → linked to this identity and logged in.
3. **A pending co-organizer invite** (Settings → Organizers) for that email → a passwordless account is provisioned into that org.
4. **A brand-new identity, when `ALLOW_SIGNUP=true`** → a one-time **org-setup screen** to name their new organization, then logged in. (With `ALLOW_SIGNUP=false`, an unknown identity is refused — invite them first.)

Each account can hold **one** SSO identity at a time. Signing in with a second
provider for an already-linked account triggers a confirmation relink (see
"If your identity provider reassigns…" below) rather than a silent rebind. An
SSO-provisioned account has no local password; it can set one from
**Settings → Account** if it also wants password login.

### SSO-only mode

To make SSO the *only* way in, set `LOCAL_LOGIN_DISABLED=true`. This hides the
password form + local signup and rejects `POST /api/auth/login` / local signup.
As a fail-safe it's **ignored unless at least one SSO provider is configured**,
so a typo can't lock you out of the app entirely.

### If a provider reassigns a subject — or an organizer switches providers

An organizer account is bound to one provider-prefixed subject (`google:…`,
`discord:…`, `oidc:…`), not just their email — deliberately, so a provider that
later reuses or changes email addresses can't silently take over an account, and
so switching an account from one provider to another is a deliberate act. This
fires when a provider account is deleted and recreated with the same mailbox
(documented Pocket ID behavior), **or** when someone who linked via Google later
tries "Continue with Discord" for the same email. In every case SSO login
refuses to rebind on email equality alone.

When that happens, the app emails the organizer's **existing** address a one-time confirmation link (`/oidc-relink?token=…`) — opening it relinks the account to the new subject and revokes every existing session and API token for it, so re-confirm intentionally. If SMTP isn't configured on your deployment, there's no other way to deliver that link, so use the operator recovery CLI instead:

```sh
docker compose exec app node server/dist/scripts/oidc-relink.js organizer@example.com
```

It only runs after the organizer has actually attempted an SSO login and been refused (that attempt is what records the pending relink) — it previews the exact change (current vs. pending subject) and asks for an explicit `yes` before applying anything; pass `--yes` to skip the interactive prompt for scripted use. Like `import-legacy.js`, this requires direct host/operator access — there's no HTTP route for it.

## 9. Optional: outbound webhooks (Home Assistant, etc.)

An organizer can configure any number of webhooks (Settings → Webhooks) — each gets its own HMAC-signed HTTP POST whenever a round starts, is extended, or completes, and when a round's pairings are posted. Off unless at least one is configured, and each is delivered to independently, so you can push the same events to several places at once (e.g. Home Assistant *and* a Discord relay) without one affecting the other. This was built with Home Assistant in mind (e.g. driving a live round-timer display and chime on a smart display), but it's plain HTTP — any receiver that accepts a POST works (Node-RED, n8n, a Discord relay, etc.).

Each request body looks like:

```json
{
  "event": "round.started",
  "timestamp": "2026-08-26T18:05:30.580Z",
  "data": {
    "podId": "…", "podName": "Draft 1",
    "tournamentId": "…", "tournamentName": "Test GP",
    "roundId": "…", "roundNumber": 1,
    "startedAt": "2026-08-26T18:05:30.575Z", "endsAt": "2026-08-26T18:55:30.575Z",
    "matches": [{ "tableNumber": 1, "entrantA": { "id": "…", "name": "Alice" }, "entrantB": { "id": "…", "name": "Bob" } }]
  }
}
```

`event` is one of `round.started`, `round.extended`, `round.completed` (whose `data.standings` carries the updated, ranked standings instead of `matches`), `pairings.posted`, or `pod.completed`. There's no continuous "remaining time" stream — a receiver derives the live countdown itself from `endsAt`, the same way the app's own frontend does, then re-renders every second or so and decides its own chime timing.

For round 1 specifically, `pairings.posted` fires when the organizer explicitly reveals the round's pairings, not when the round is generated — generating round 1 early (to produce a seating chart, or just before everyone's ready to see their opponent) never sends this event on its own, since a webhook receiver is exactly the kind of early-leak path the reveal step exists to close. Every later round fires immediately on generation as before.

`round.completed` also carries `isLastRound` (`true` when that round was the pod's last configured round) alongside `roundNumber` and `standings` — so a receiver that only listens for `round.completed` can still detect "the pod just finished" without also handling a second event type. `pod.completed` fires as a second, dedicated event at that same moment (there's no separate "mark pod complete" action in the app — this is the natural moment a pod is fully decided) for receivers that would rather filter on event type than a boolean field; its payload carries the same ranked `standings` plus a `winner` field (the rank-1 entry, or `null` for an empty pod).

Verify the request actually came from your deployment by checking the `X-LimitedGauntlet-Signature: sha256=<hex>` header — an HMAC-SHA256 of the raw request body using that specific webhook's own signing secret (each webhook you configure gets its own, shown in Settings):

```js
const crypto = require("node:crypto");
const expected = "sha256=" + crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
// compare with the X-LimitedGauntlet-Signature header (use a timing-safe comparison)
```

The webhook URL only needs to be reachable from the container — a LAN address (e.g. your Home Assistant at `http://192.168.1.231:8123/api/webhook/…`) works fine. Loopback and link-local addresses (including cloud metadata endpoints) are refused as a target. Delivery is fire-and-forget with a 5-second timeout and no retries — a slow or unreachable receiver never blocks a round operation, and a failed delivery is just logged, not surfaced in the UI (use the Settings page's "Send test event" button to check your setup works).

## 10. Optional: web analytics (Umami)

Off by default — no tracking script is added to any page unless you configure it. If you run your own [Umami](https://umami.is) instance and want its snippet on every page this app serves (organizer pages and public `/o/<slug>/...` pages alike), set three env vars:

```
TRACKING_PROVIDER=umami
TRACKING_SCRIPT_URL=https://analytics.example.com/script.js   # your own Umami instance's script host
TRACKING_CODE=3d9f1e2a-7b4c-4a1d-9e6f-2c8b1a0d5f3e             # that site's Website ID (Umami → Settings → Websites)
```

All three are validated at startup — an unset `TRACKING_PROVIDER` disables the feature entirely; anything else invalid (an unknown provider, a non-`https://` script URL, a code that isn't a well-formed UUID) makes the app refuse to start with a clear error rather than silently shipping a broken or unsafe script tag.

The browser never talks to `TRACKING_SCRIPT_URL` directly: this app proxies the script and Umami's collect endpoint through its own origin (`GET /stats.js`, `POST /api/send`), so the page only ever loads `/stats.js` same-origin. That means the app's Content-Security-Policy never needs widening for this — `script-src`/`connect-src` stay `'self'` regardless of whether analytics are configured — and it also sidesteps ad-blocker lists that specifically filter third-party `analytics.*` hostnames serving a stock `script.js`, a real gap the original CSP-allowlist approach had. Nothing else to configure by hand either way.

Only Umami is supported today (`TRACKING_PROVIDER=umami` is the only valid value), but the mechanism is provider-abstracted internally (`server/src/trackingProviders.ts`) so a second provider can be added later without redesigning this.

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
curl https://your-tunnel-hostname.example/api/healthz   # expect {"status":"ok"}
```
