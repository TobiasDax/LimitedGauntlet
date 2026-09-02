# Limited Gauntlet

Limited Gauntlet is a tournament organizer tool for Magic: the Gathering Draft, Sealed, and Constructed tournaments.

Its focus is on bringing multiple tools into one platform to help facilitate a great MTG event.

Limited Gauntlet provides a robust Swiss tournament engine that is flexible enough to handle edge cases, like intentional draws in final games or custom seat orders for each draft.

**Try it live:** [demo.limited-gauntlet.com](https://demo.limited-gauntlet.com) — a public demo with anonymized seed data that resets on a schedule.  
**email:** admin@demo.com  
**password:** admin1234  

![Hall of Fame — all-time org leaderboard](docs/screenshots/11-hall-of-fame.png)

---

## AI Disclaimer

This tool is completely vibe-coded by Claude Code — I only provide the specs for what should be built and test it on my own instance as thoroughly as possible.

I also ran an extensive vulnerability scan through Codex Security: <https://github.com/openai/codex-security>

I plan to support and enhance this tool in the future, since it's in active use for me, but my support capabilities are limited. Use this at your own risk, but feel free to leave bug reports and suggestions in the issues.

## Organizations, Tournaments and Pods

The tool was built for a regularly occurring, weekend-long event with multiple draft events over a few days and at least one event every year.

While it is easy to just run a one-off draft using the Swiss engine, round timers, and standings table, Limited Gauntlet shines especially when playing with the same people multiple times.

### Organization

An organization can run any number of tournaments with any number of different pods. Players are individual to an organization and their performance and stats are tracked throughout all events in that org.

![Organization — player roster](docs/screenshots/01-home.png)

### Tournaments

A tournament can be only one draft, or a whole slew of different pods, spanning multiple days and formats.

Each tournament can have its own rich-text description, stat breakdown, and value overview.

![Tournament overview](docs/screenshots/02-tournament-overview.png)

### Player Accounts

Players can be added to the Roster by any TO and can exist as fully local references. But players can also be invited to create their own account on the app. This enables them to submit match results, check into tournaments, and see their token ledger (if that function is enabled).

### Pods

A pod can be any sort of 1v1 or team-vs-team event, like 2HG. The format of the pod can be freely chosen (Draft, Sealed, Chaos Draft, Constructed, or Custom) and set up to fit your event.

People can be assigned to a pod or a team for those events.

![Pod setup options](docs/screenshots/pod-options.png)

![Pod entrants and teams](docs/screenshots/03-pod-entrants.png)

#### Seatings

After the first round gets paired, the pairings are used to calculate a draft seating order. This happens based on cross seating and is displayed as a virtual table above the pairings for the first round.

#### Pairings

Pairings for the first round are random, but can be customized if a certain seating or playing order is required. From there, pairings are Swiss-standard within the pod (never repeating an opponent you've already played in that pod), with a soft avoidance on top for opponents you've already played anywhere else in the tournament that weekend — so across multiple pods, everyone tends to play everyone.

![Pod pairings](docs/screenshots/pod-pairings.png)

#### Timer and Display mode

The pairings and timer page can be provided to the users via link or QR code, or displayed on a central device. Display mode adds audible chimes to the timer so the players know when time is short or the game ends.

An additional timer can be created before pairing, for draft or deck-building time.

#### Dropped Players

Between rounds any player can be dropped from a pod; the remaining rounds will then include a bye if a dropped player results in an uneven player count.

#### Standings

The standings table can be adjusted if needed.

![Pod standings](docs/screenshots/06-pod-standings.png)

#### Rare Pick

The opened cards can be added to the pod and sorted by their € value at the time of recording.

They are automatically sorted by value and can be assigned to a player. The cards will then be permanently added to that player's Treasure Chest to commemorate their wins.

The three most valuable cards are automatically assigned based on the standings table; these assignments can be easily changed later.

Rare Pick is an optional feature and can be disabled if it's not applicable for the pod.

![Rare Pick — card value tracking](docs/screenshots/07-pod-value.png)

#### XLSX Export

A finished tournament report can be exported as a human-readable spreadsheet. This includes standings, points, round details, and tokens if applicable.

---

## Hall of Fame

Since all players in an org are tracked through multiple games, we can provide some fun statistics on them.

Most importantly, the overall rating and their average win rate and points, but also the number of times a player won the main event of a tournament.

Each player also features a personal page with more stats on them individually and in relation to their opponents.

![Hall of Fame](docs/screenshots/11-hall-of-fame.png)

Overall standings can also be tracked per tournament:

![Tournament standings](docs/screenshots/08-tournament-standings.png)

---

## Treasure Chest

An overview of the opened cards at all events, to see what has been pulled and by whom.

![Treasure Chest — all events](docs/screenshots/13-treasure-chest.png)

This can also be broken down per tournament.

![Treasure Chest per tournament](docs/screenshots/09-tournament-value.png)

## Tokens

An opt-in org wide points system for players. Based on Participation and standing in the played pods. This can be used by TOs to create an (external) Prize Wall or have a second leaderboard.

## Public Links

Each page has an additional public URL that is not indexed by search engines but can be shared with players or friends. This is a read-only view of the data.

For organizations that prefer a bit more privacy, a password can be set by an organizer.

---

# Tech

Besides the Magic-focused functions needed to run a successful limited tournament, Limited Gauntlet features a few tech features.

## Live Updates

Timers, pairings, and standings all update live — no need to reload the page.

## Multiple Organizers

The first person to register is the main TO and creates the organization during signup. If other users need to be able to edit a tournament or pod, they can be invited through the Settings screen. Invites are sent via SMTP, which must be configured on the server.

## OIDC Login

The server can be configured to support an additional OIDC login path, or OIDC only with no option to log in with a local account.

## Data Export/Import

All the data put into Limited Gauntlet can be exported to a JSON file at any time. The JSON file can also be used to import that data into a new or different organization, or onto a different host.

### Claude Skill

If you have historical data you want to display in Limited Gauntlet, I created a Claude Code skill to help bring that data into the required format for an import into Limited Gauntlet. See [History Import](docs/history-import.md) for the full walkthrough.

## Webhooks

Any organizer can wire an event stream out of the app from **Settings → Webhooks** — no code change or redeploy needed. An org can configure any number of webhooks, each with its own URL and its own regenerable HMAC signing secret, delivered independently — so the same events can go to several places at once (e.g. Home Assistant and a Discord relay) without one affecting the other.

Webhooks fire for five events: pairings being posted, a round starting, a round being extended, a round completing, and a pod finishing (`pairings.posted`, `round.started`, `round.extended`, `round.completed`, `pod.completed`). Every payload carries the pod and tournament it belongs to, plus event-specific detail — resolved player/team names and table numbers for pairings, the updated ranked standings for a completed round, the winner for a finished pod — so a receiver never has to call back into the API to know what happened. There's no continuous "time remaining" stream: a receiver derives its own live countdown from the `endsAt` timestamp each payload carries, the same way the app's own frontend does.

Each request is signed (`X-LimitedGauntlet-Signature: sha256=<hmac>`) so a receiver can verify it actually came from your deployment. Delivery is fire-and-forget with a short timeout and no retries — a slow or unreachable receiver never blocks a round action in the app. A "Send test event" button on the Settings page lets you check a new webhook works before relying on it. See [docs/deployment.md § 9](docs/deployment.md#9-optional-outbound-webhooks-home-assistant-etc) for configuration details.

## API and MCP

Every action available in the UI is backed by the same authenticated REST API. Mint a personal **API Token** from the top-right nav, and it grants the same access as your own login (organizer-scoped, revocable any time from the same page).

For AI-agent use, an MCP (Model Context Protocol) server ships in the repo (`mcp/`) that wraps that REST API as a set of tools for reading and managing tournaments, pods, rounds, results, and card pulls from an MCP-compatible client (Claude Desktop, Claude Code, etc.) — pairing, standings, and validation all stay authoritative on the server, the MCP layer is a thin pass-through rather than a second implementation. Destructive actions (deleting a tournament/pod, removing an entrant, deleting a card pull) require an explicit confirmation step before they execute, so an agent can't accidentally wipe data on a single misfired call. See `mcp/README.md` for setup.

## Stack

Node.js + TypeScript throughout — Fastify + Prisma + PostgreSQL on the backend, React + Vite + Tailwind on the frontend, Socket.IO for realtime. Ships as a single Docker image plus a Postgres container; migrations run automatically on startup.

---

# Quick Start

## Published Image

No git clone or build needed — images are published to GHCR on every tagged release: [`ghcr.io/tobiasdax/limitedgauntlet`](https://github.com/TobiasDax/LimitedGauntlet/pkgs/container/limitedgauntlet).

1. Make a directory for the deployment and grab `docker-compose.image.yml` from the repo, saving it as `docker-compose.yml`.
2. Copy `.env.example` to `.env` and fill it in (see Config below).
3. `docker compose up -d` — migrations are applied automatically on start.

`:latest` tracks the newest release automatically. For a controlled, reproducible deployment, pin a specific version instead (e.g. `ghcr.io/tobiasdax/limitedgauntlet:0.2.0`) and bump it deliberately with `docker compose pull && docker compose up -d` when you're ready to upgrade — migrations still apply automatically either way.

No ingress is defined by default: the app publishes no host port and no reverse proxy/tunnel is bundled. Add a `docker-compose.override.yml` or change your local compose file to expose it — a published port for LAN/direct use, or your own reverse proxy/tunnel service on a shared network — see [docs/deployment.md § 4](docs/deployment.md#4-exposure-and-alternatives) for both patterns, including setting `TRUSTED_PROXIES` to match.

## Config

### OIDC

Optional OIDC / SSO login (single identity provider per deployment). Entirely optional: leave `OIDC_ISSUER` empty and the app runs password-only (the "Sign in with" button just isn't shown). When set, an SSO login links to an existing organizer account by verified email, or provisions one if the email has a pending co-organizer invite — it never creates a new org, so the closed-signup posture is preserved. `OIDC_ISSUER` is the provider's base URL (discovery must be reachable at `<issuer>/.well-known/openid-configuration`). Register `OIDC_REDIRECT_URI` at the provider as `<APP_BASE_URL>/api/auth/oidc/callback` (leave it blank to derive that automatically from `APP_BASE_URL`). See [docs/deployment.md § 8](docs/deployment.md#8-optional-sso-login-oidc-google-discord) for the full SSO setup guide.

```
OIDC_ISSUER=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_REDIRECT_URI=
OIDC_PROVIDER_NAME=SSO
OIDC_SCOPE=openid email profile
```

### Google Login

Optional social login — independent of OIDC. Set both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to show the "Sign in with Google" button. Account-linking follows the same rules as OIDC: links to an existing organizer account by verified email, or provisions one if the email has a pending co-organizer invite — never creates a new org. Full setup walkthrough: [docs/sso-google-discord.md](docs/sso-google-discord.md).

1. Create an **OAuth 2.0 Web application** client in [Google Cloud Console](https://console.cloud.google.com/).
2. Add an **Authorized redirect URI**: `<APP_BASE_URL>/api/auth/sso/google/callback`
3. Copy the credentials into `.env`:

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

### Discord Login

Same account-linking rules apply. Set both `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` to show the "Sign in with Discord" button. Full setup walkthrough: [docs/sso-google-discord.md](docs/sso-google-discord.md).

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Under **OAuth2 → Redirects**, add: `<APP_BASE_URL>/api/auth/sso/discord/callback`
3. Required OAuth2 scopes: `identify` + `email`
4. Copy the credentials into `.env`:

```
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
```

### Local Login

Switch to SSO-only: disable local password login + local signup so OIDC is the only way in. Only takes effect when OIDC above is configured (a fail-safe so you can't lock yourself out). New users signing in via SSO for the first time get an org-setup screen (when ALLOW_SIGNUP=true); existing/invited accounts keep working. Leave false to keep local email+password accounts alongside SSO.

```
LOCAL_LOGIN_DISABLED=false
```

### Public Signup

Closed by default. Set to `true` only while someone actually needs to create an account, then set it back to `false` (requires a restart either way: `docker compose up -d` picks up the new value). This is also needed to create the initial user account.

```
ALLOW_SIGNUP=false
```

### SMTP

Optional SMTP for transactional email (currently: verifying an organizer's new email address before switching to it). Entirely optional — leave `SMTP_HOST` empty and email features stay disabled (email changes just aren't offered) without affecting the rest of the app. `SMTP_FROM` is the From: address. `SMTP_SECURE=true` means implicit TLS (port 465); `false` means STARTTLS (587).

```
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

### POSTGRES

Postgres credentials used by both the `db` and `app` services.

```
POSTGRES_USER=limitedgauntlet
POSTGRES_PASSWORD=changeme
POSTGRES_DB=limitedgauntlet
```

### Trusted Proxies

Comma-separated exact proxy IPs/CIDRs allowed to set `X-Forwarded-*` identity. Leave blank for direct/LAN mode (no reverse proxy or tunnel in front). If you put a reverse proxy or tunnel (Cloudflare Tunnel, Nginx, Caddy, Traefik, ...) in front, set this to its exact container IP/CIDR on the network it shares with the app. Never use a broad Docker/private-network CIDR.

```
TRUSTED_PROXIES=
```

### Session Secret

Session cookie signing key — 32 bytes, hex-encoded. Generate with `openssl rand -hex 32`.

```
SESSION_SECRET=
```

Set `SESSION_COOKIE_SECURE` to `true` once a TLS-terminating reverse proxy is in front of this app (marks the session cookie Secure, so it's dropped over plain HTTP). Leave `false` for local/LAN-only use.

```
SESSION_COOKIE_SECURE=false
```

### Base URL

Public base URL the app is reached at (e.g. `https://gauntlet.example.com`). Used to build absolute links in emails. If empty, the app derives it from the request origin — fine for most setups; set it if you send mail from behind a proxy that rewrites the host.

```
APP_BASE_URL=
```

### Legal Link

Optional footer legal link (e.g. Impressum/Privacy Policy). This is self-hosted OSS with no built-in legal content — if your jurisdiction requires one, host it yourself and point these at it. Leave both empty to omit the link entirely (footer still shows GitHub + License).

```
LEGAL_LINK_URL=
LEGAL_LINK_LABEL=
```

---

# Roadmap

The app is **feature-complete and running in production** ([latest release](https://github.com/TobiasDax/LimitedGauntlet/releases/latest)). The full, always-current backlog lives in [`ROADMAP.md`](ROADMAP.md) — a quick snapshot of what's still planned:

* **Deck photos** — upload a photo of each entrant's drafted deck to the pod's standings page; one photo per entrant, viewable in a modal (PI-62).
* **Legacy history import via the UI** — accept the `legacy-data.json` format the `/import-history` Claude skill produces directly through Settings → Import, without requiring shell access (PI-39).
* **SSO-only first-password** — a Settings affordance letting accounts created exclusively via SSO set a local password without needing to supply a current one (PI-42 follow-up).

See [`ROADMAP.md`](ROADMAP.md) for the full list, status, and design notes.

# Further Reading

**Deployment** — production hardening, reverse proxy / TLS exposure options, SSO setup, webhooks, and updating an existing install. See [docs/deployment.md](docs/deployment.md).

**Pairings & Standings** — how Swiss pairing, cross-pod opponent avoidance, and standings tiebreakers work in detail. See [docs/pairings-and-standings.md](docs/pairings-and-standings.md).

**Development** — building from source and setting up a local dev environment for contributors. See [docs/development.md](docs/development.md).
