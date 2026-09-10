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

Pods in a tournament are split into **Scheduled** and **On demand** tabs. A scheduled pod can carry a date and start time; a multi-day tournament groups its scheduled pods under per-day headings. Finished (and cancelled) pods sink to the bottom of the list in completion order, and an organizer can reorder the rest with up/down arrows. Each pod row shows its current entrant count at a glance.

![Tournament overview](docs/screenshots/02-tournament-overview.png)

<!-- screenshot: the Scheduled / On demand pod-list tabs with date dividers -->

### Player Accounts

Players can be added to the Roster by any TO and can exist as fully local references. But players can also be invited to create their own account on the app. This enables them to submit match results, check into tournaments, and see their token ledger (if that function is enabled).

### Pods

A pod can be any sort of 1v1 or team-vs-team event, like 2HG. The format of the pod can be freely chosen (Draft, Sealed, Chaos Draft, Constructed, or Custom) and set up to fit your event.

People can be assigned to a pod or a team for those events.

![Pod setup options](docs/screenshots/pod-options.png)

![Pod entrants and teams](docs/screenshots/03-pod-entrants.png)

#### Seatings

Draft, Chaos Draft, and Sealed pods get a dedicated **Seatings** tab. Generating seatings creates round 1 behind the scenes and shows only the derived seating chart — a virtual table computed from the round-1 pairing via cross-seating — with no "who plays whom" listing. Revealing the pairings is a separate, deliberate action: after the physical draft or deckbuild, the organizer clicks **Reveal pairings**, and only then do round-1 opponents become visible anywhere (the Pairings tab, Display Mode, the public page). Later rounds are computed from the previous round's results, so there's nothing to hide.

#### Pairings

Pairings for the first round are random, but can be customized if a certain seating or playing order is required. From there, pairings are Swiss-standard within the pod (never repeating an opponent you've already played in that pod), with a soft avoidance on top for opponents you've already played anywhere else in the tournament that weekend — so across multiple pods, everyone tends to play everyone.

![Pod pairings](docs/screenshots/pod-pairings.png)

#### Timer and Display mode

The pairings and timer page can be provided to the users via link or QR code, or displayed on a central device. Display mode adds audible chimes to the timer so the players know when time is short or the game ends.

An additional timer can be created before pairing, for draft or deck-building time.

#### Dropped Players

A player can be dropped from the Pairings screen — both between rounds and **mid-round**, right where their match result is entered (the organizer picks who dropped alongside the result). Either way the drop takes effect from the next round, adding a bye if it leaves an uneven count.

#### Cancelling a pod

A pod that was called off (rather than played out) can be **cancelled** from its settings, behind a confirmation. A cancelled pod moves to the finished area, is marked as such, and is excluded from all stats and tokens. It can be un-cancelled if it was a mistake.

#### On-demand side events

For the pods that get fired up spontaneously (a Chaosdraft when enough people want one), the organizer signs a player up for **every** on-demand pod they'd be happy to play. When one of those pods actually starts, its entrants are **automatically withdrawn from the other not-yet-started on-demand pods** — so you don't have to unwind the extra sign-ups by hand. Each on-demand pod can have a capacity with a "ready to start" indicator, and undoing a pod's first pairing offers to re-add the players it withdrew.

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

Every player name in the app is a link to that player's personal page — more stats on them individually and in relation to their opponents, plus a full history of every pod they've been in (upcoming and finished, each linking to the pod).

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

For organizations that prefer a bit more privacy, a password can be set by an organizer to gate the whole public surface.

## Privacy & GDPR

Since player names and full histories sit on open URLs, the app ships the tools for handling that:

- **Pseudonymise a player on public pages** — their name becomes a stable handle like `Player 7F2A` everywhere public, results still followable, real name off the open web. The right default for anyone under 16.
- **Anonymise a player** — honours an erasure request without breaking the historical record (scrubs the name, keeps every result).
- **Per-player data export** — a readable JSON of everything the app holds about one player, triggered by an organizer or by the player from their own portal.
- **Player self-service** — a logged-in player can correct their own name and file a removal request.
- A **built-in Impressum + privacy notice at `/legal`**, rendered from `LEGAL_*` env vars, so an EU deployment is compliant-by-default without hosting its own.

Full walkthrough in [docs/player-privacy.md](docs/player-privacy.md). The operator's compliance side — lawful basis, processor agreements, retention, breach process — is in [docs/gdpr.md](docs/gdpr.md).

<!-- screenshot: the roster row "Privacy ▾" menu (Pseudonymise / Anonymise / Download data) -->
<!-- screenshot: the built-in /legal page -->


---

# Tech

Besides the Magic-focused functions needed to run a successful limited tournament, Limited Gauntlet features a few tech features.

## Live Updates

Timers, pairings, and standings all update live — no need to reload the page.

## Organizer Accounts

The first person to register creates the organization during signup. Any organizer can then invite co-organizers from the Settings screen — all members of an org have equal power, there's no owner role. Invites work with or without SMTP: if mail is configured they're emailed, otherwise the organizer just shares the invite link (with a QR code).

One login can belong to **several organizations** — as an organizer of some and, separately, a player at others. An org switcher in the top bar moves between them, and accepting a new invite adds a membership rather than forcing a second account. Leaving your last org keeps the account; it lands on an org chooser.

## SSO Login

The server can add a **Sign in with…** button for a generic OIDC provider, Google, or Discord — alongside local passwords, or (`LOCAL_LOGIN_DISABLED=true`) as the only way in. SSO never creates a new organization: it links to an existing organizer account by verified email, or provisions one for a pending co-organizer invite. Setup is in [Config](#config) below.

## Data Export/Import

All the data put into Limited Gauntlet can be exported to a JSON file at any time. The JSON file can also be used to import that data into a new or different organization, or onto a different host.

### Claude Skill

If you have historical data you want to display in Limited Gauntlet, I created a Claude Code skill to help bring that data into the required format for an import into Limited Gauntlet. See [History Import](docs/history-import.md) for the full walkthrough.

## Webhooks

Any organizer can wire an event stream out of the app from **Settings → Webhooks** — no code change or redeploy. Configure any number of webhooks, each with its own URL and regenerable HMAC secret, delivered in parallel so the same events can fan out to Home Assistant *and* a Discord relay without one affecting the other. Events fire for pairings posted, round start/extend/complete, and pod completion; each HMAC-signed payload carries resolved names, table numbers, standings, and an `endsAt` timestamp, so a receiver never has to call back into the API. Delivery is fire-and-forget with no retries.

Full event catalog, payload shapes, and a signature-verification snippet: **[docs/webhooks.md](docs/webhooks.md)**. Network setup: [docs/deployment.md § 9](docs/deployment.md#9-optional-outbound-webhooks-home-assistant-etc).

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

`:latest` tracks the newest release automatically. For a controlled, reproducible deployment, pin a specific version instead (e.g. `ghcr.io/tobiasdax/limitedgauntlet:0.13.0`) and bump it deliberately with `docker compose pull && docker compose up -d` when you're ready to upgrade — migrations still apply automatically either way.

No ingress is defined by default: the app publishes no host port and no reverse proxy/tunnel is bundled. Add a `docker-compose.override.yml` or change your local compose file to expose it — a published port for LAN/direct use, or your own reverse proxy/tunnel service on a shared network — see [docs/deployment.md § 4](docs/deployment.md#4-exposure-and-alternatives) for both patterns, including setting `TRUSTED_PROXIES` to match.

## Config

Everything lives in `.env` — copy [`.env.example`](.env.example), which documents every variable inline. The only two you **must** set:

| | |
|---|---|
| **`POSTGRES_PASSWORD`** | a real secret, not the placeholder |
| **`SESSION_SECRET`** | `openssl rand -hex 32` — the app refuses to start without it |

To create the first organizer account, set `ALLOW_SIGNUP=true`, sign up, set it back. Behind a TLS reverse proxy or tunnel, also set `TRUSTED_PROXIES` to the proxy's exact IP/CIDR and `SESSION_COOKIE_SECURE=true` — see [docs/deployment.md § 4](docs/deployment.md#4-exposure-and-alternatives).

Everything else is an optional feature, inert until its variables are set:

| Feature | Variables | Setup notes |
|---|---|---|
| Transactional email (email-change verification) | `SMTP_*` | leave `SMTP_HOST` blank to disable |
| SSO — generic OIDC | `OIDC_*` | ↓ redirect URIs below |
| SSO — Google / Discord | `GOOGLE_*` / `DISCORD_*` | [docs/sso-google-discord.md](docs/sso-google-discord.md) |
| SSO-only (no local passwords) | `LOCAL_LOGIN_DISABLED` | only takes effect once SSO is configured |
| Web analytics (self-hosted Umami) | `TRACKING_*` | [docs/deployment.md § 10](docs/deployment.md#10-optional-web-analytics-umami) |
| IP-address privacy (logs + analytics) | `REQUEST_LOG` (`minimal`), `TRACKING_FORWARD_IP` (`truncated`) | [docs/deployment.md § 10b](docs/deployment.md) |
| Built-in `/legal` page | `LEGAL_*` | [docs/deployment.md § 2b](docs/deployment.md), [docs/player-privacy.md](docs/player-privacy.md) |
| Operator alert on new-org signup | `ADMIN_WEBHOOK_*` | [docs/deployment.md § 11](docs/deployment.md#11-optional-operator-alert-on-a-new-org-signup) |

SSO links a login to an existing organizer account by verified email (or provisions one for a pending co-organizer invite) — it never creates a new org, so the closed-signup posture holds.

### SSO redirect URIs

Register these at the provider (`<APP_BASE_URL>` is your public base URL):

- **OIDC** — `<APP_BASE_URL>/api/auth/oidc/callback` (or leave `OIDC_REDIRECT_URI` blank to derive it). Discovery must resolve at `<OIDC_ISSUER>/.well-known/openid-configuration`.
- **Google** — `<APP_BASE_URL>/api/auth/sso/google/callback`; an OAuth 2.0 *Web application* client in Google Cloud Console.
- **Discord** — `<APP_BASE_URL>/api/auth/sso/discord/callback`; an app in the Discord Developer Portal, scopes `identify` + `email`.

Full walkthroughs: [docs/deployment.md § 8](docs/deployment.md#8-optional-sso-login-oidc-google-discord) and [docs/sso-google-discord.md](docs/sso-google-discord.md).

---

# Roadmap

The app is **feature-complete and running in production** ([latest release](https://github.com/TobiasDax/LimitedGauntlet/releases/latest)). The full, always-current backlog lives in [`ROADMAP.md`](ROADMAP.md) — a quick snapshot of the notable items still planned:

* **Deck photos** — upload a photo of each entrant's drafted deck to the pod's standings page; one photo per entrant, viewable in a modal (PI-62).
* **Legacy history import via the UI** — accept the `legacy-data.json` format the `/import-history` Claude skill produces directly through Settings → Import, without requiring shell access (PI-39).

See [`ROADMAP.md`](ROADMAP.md) for the full list (including project-health / CI items), status, and design notes.

# Further Reading

**Deployment** — production hardening, reverse proxy / TLS exposure options, SSO setup, webhooks, and updating an existing install. See [docs/deployment.md](docs/deployment.md).

**Pairings & Standings** — how Swiss pairing, cross-pod opponent avoidance, and standings tiebreakers work in detail. See [docs/pairings-and-standings.md](docs/pairings-and-standings.md).

**Webhooks** — the event catalog, payload shapes, and signature verification. See [docs/webhooks.md](docs/webhooks.md).

**Player privacy** — the anonymise / export / pseudonymise tools, player self-service, and the built-in `/legal` page, from the organizer's and player's side. See [docs/player-privacy.md](docs/player-privacy.md).

**GDPR / DSGVO** — what personal data the app stores, your responsibilities as the operator, and a fill-in privacy-policy template (EN + DE). See [docs/gdpr.md](docs/gdpr.md) and [docs/privacy-policy-template.md](docs/privacy-policy-template.md).

**Development** — building from source and setting up a local dev environment for contributors. See [docs/development.md](docs/development.md).
