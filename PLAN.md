# LimitedGauntlet — self-hosted MTG Limited tournament tracker

This is the canonical architecture/design doc for the project. It was drafted collaboratively with Claude Code (planning session, 2026-08-23) against ~4 years of real tournament history pulled from Tobias's Outline instance. `STEPS.md` in this repo tracks build progress against the order laid out here — check that file for "what's done, what's next."

## Context

Tobias runs a yearly weekend MTG Limited event (8-10 players, ~6 draft/sealed pods across Fri/Sat/Sun) and currently tracks pairings on a third-party site (mtgarena.appspot.com) plus manually maintains standings, a weekend "Gesamtwertung" (overall points table), and a "best pulls" value leaderboard in Outline docs. The external pairing tool is annoying to use and none of it is connected — Gesamtwertung has to be hand-copied from each pod's final standings after the fact.

Goal: replace this with a self-hosted, open-source Docker app that (a) runs the whole weekend end-to-end — pairing, results, live standings, timer — and (b) is built as a real multi-group OSS tool, not a single-purpose script, since Tobias wants to publish it.

Requirements were gathered via extensive Q&A and confirmed against 4 years of historical Outline data (2024 Bad Gechingen, 2025 Winter/Sommer Eichstätt, 2026 Sommer in progress). Key confirmed decisions:
- **Multi-tenant**: one deployment hosts multiple isolated organizations, each with their own admin login + roster.
- **Format-agnostic core**: Swiss/team pairing and standings engine works for any format; Limited-specific extras (pack notes, value tracking) are optional per pod.
- **Team pods** (e.g. 2025 Sommer's Battlebond 2HG event) credit each team member the team's **full** match points toward Gesamtwertung — confirmed against real data (team scored 5, all 3 members show 5).
- **Gesamtwertung ranking = average points per pod played** (not raw total), normalizing for partial attendance (e.g. someone who could only make one day of the weekend). Raw total still shown alongside.
- **Pairing**: auto Swiss by default, manual override always available (especially round 1), and — new capability the old tool didn't have — pairing suggestions should factor in the **whole weekend's opponent history** across pods, nudging toward "everyone plays everyone at least once," not just avoiding repeats within one pod.
- **Round timer** with audible signal tone, real-time synced across devices.
- **Result entry v1**: organizer-only (matches how the iPad-as-terminal workflow works today). v2 (not in this build): private per-player links to self-submit, organizer finalizes.
- **Value tracking**: auto Scryfall price/image lookup instead of manual price typing.
- **Public read-only pages**, no login needed to view standings — organizer login only for running the event.
- **Import the 4 years of existing Outline history** so Gesamtwertung/Hall-of-Fame data is complete from day one.
- **Deploy target**: DaxLite via Docker Compose (Arcane-managed), Postgres as a second container.

## Architecture

**Organizations & multi-year history**: An `Organization` is the persistent group (e.g. Tobias's "GP Eichstätt" crew), not a single weekend. It owns one `Player` roster that persists across years (fixing the old name-drift problem — the same person spelled or abbreviated differently across different years' docs). An org creates a new `Tournament` row for each yearly GP weekend (2024 Bad Gechingen, 2025 Winter, 2025 Sommer, 2026 Sommer, ... indefinitely) — this is already how the data model above is shaped, just making it explicit: **org : tournament is one-to-many, unbounded**. Each `Tournament` has its own `startDate`/`endDate`. Cross-tournament views (the all-time "Hall of Fame," career-average leaderboard) query across all of an org's tournaments.

`Pod` additionally gets a `date` field (calendar date the pod runs on, e.g. the actual Saturday) separate from `Round.startedAt` (precise timestamp when a specific round's clock starts) — the old docs organized pods as "Freitag / Samstag 1 / Samstag - Chaosdraft / ..." which is a day label, not just a sequence number, and Tobias flagged that date tracking needs to be explicit rather than implied.

**Stack**: Node.js/TypeScript throughout — Fastify (API + WebSocket) + Prisma + PostgreSQL on the backend, React + Vite + TypeScript + Tailwind on the frontend, Socket.IO for realtime. Single Docker image (multi-stage build: Vite build → static assets, tsc build → backend dist, final slim Node runtime serves API, WebSocket, and the SPA's static files off one port). `docker-compose.yml` ships two services: `app` + `db` (postgres:16-alpine). Prisma Migrate runs automatically on container start so self-hosters never touch SQL directly, and Prisma Studio is available for the hobbyist-friendly "just look at the data" case.

Rationale: one language end-to-end keeps this approachable for an OSS project maintained by a non-full-time-programmer; Fastify+Socket.IO handles persistent WebSocket connections cleanly in a standalone container (unlike serverless-oriented frameworks); Prisma's migration tooling + Studio GUI minimizes DB maintenance burden.

**Data model** (Prisma schema, `prisma/schema.prisma`):
- `Organization` (slug, name) — the tenancy boundary. All other org-scoped tables FK to it.
- `OrganizerAccount` (orgId, email, passwordHash via argon2, name) — login-capable users; multiple organizers per org allowed (e.g. co-organizing friend).
- `Player` (orgId, displayName) — persistent roster, reused across years to avoid the name-drift seen in the old docs (the same person spelled or abbreviated differently across years).
- `Tournament` (orgId, name, startDate, endDate, location, status) — the "weekend"/GP. `TournamentPlayer` join table = who's attending overall.
- `Pod` (tournamentId, name, date, format enum [DRAFT/SEALED/CHAOS_DRAFT/CONSTRUCTED/CUSTOM], sequenceOrder, isTeamEvent, teamSize, roundCount, matchFormat [BO1/BO3], pointsWin/Draw/Loss, roundLengthMinutes, packConfig text, rarepicUrl, status) — one row per session (Freitag, Samstag 1, Chaosdraft, ...). All the Swiss parameters are per-pod config, not hardcoded, so a constructed event or a different group's 4-round Swiss just changes these fields.
- `Entrant` (podId, playerId?, teamId?) — the thing that gets paired; exactly one of playerId/teamId is set depending on `Pod.isTeamEvent`. Unifies standings/pairing logic for both 1v1 and team pods.
- `Team` + `TeamMember` — ad-hoc teams scoped to one pod.
- `Round` (podId, roundNumber, startedAt, endsAt, status) — `endsAt` drives the client-side timer.
- `Match` (roundId, tableNumber, entrantAId, entrantBId?, gamesWonA/B, result, reportedAt) — `entrantBId` null = bye.
- `CardPull` (podId, playerId?, cardName, scryfallId, setCode, priceEur, imageUri, addedAt) — snapshot price at add-time (prices fluctuate).

No separate "opponent history" table — pairing and the weekend coverage matrix both compute it live from `Match` joined through `Entrant`/`Team`/`TeamMember`, scoped to `tournamentId`. Cheap to recompute at this scale (≤16 players, few hundred matches/weekend) and avoids a second source of truth to keep in sync.

**Standings engine** (`server/services/standings.ts`):
- Per-pod: match points per entrant, game-win% for GW%, and OMW%/OGW% using the standard MTR formulas (33% floor per opponent to avoid one bad opponent unfairly tanking a player's tiebreaker).
- Weekend Gesamtwertung: per player, `eventsPlayed` = distinct pods with an Entrant for that player (or their team), `totalPoints` = sum of each pod's match points (team pods → full team points per player, confirmed rule), `average = totalPoints / eventsPlayed`. Ranked by average desc, tiebreak by total desc then name. Both average and total are displayed.

**Pairing engine** (`server/services/pairing.ts`):
- Standard Swiss: group entrants into score groups, greedy pair-with-backtracking within/across adjacent groups (tractable at this scale). Hard-avoid repeat opponents within the same pod (MTR-standard); soft-avoid opponents already played anywhere else in the tournament this weekend (the new "meet everyone" nudge), scored as a weighted cost function so it degrades gracefully instead of failing when full avoidance is impossible.
- Bye = lowest score group entrant without a prior bye this pod, awarded full win points.
- Round 1 (or any round) can be switched to manual: organizer assigns entrants to tables directly. Auto-pairing always remains available as "suggest, then I can still swap two entrants" — satisfies both round-1 manual and general override needs.
- A live **weekend coverage matrix** (player × player grid, color-coded by times-played) is shown to the organizer while pairing, and as a public "who's played who" page — makes the "everyone meets everyone" goal visible, not just an invisible algorithm nudge.

**Realtime layer**: Socket.IO rooms per pod (`pod:<id>`) and per tournament. Server broadcasts on round start/stop, result submitted, pairings published, card pull added. Frontend (TanStack Query) invalidates on receipt — standings/pairings/timer update live on every connected device (phones, shared TV) with no manual refresh, per the "nicely displayed" + live-UI requirement.

**Round timer**: `Round.startedAt`/`endsAt` set server-side (organizer can nudge with "+5 min"); each client counts down locally from `endsAt` (resilient to flaky wifi, no server chatter needed for ticking). A dedicated "Display Mode" (meant for the shared iPad/TV) plays an audible chime via Web Audio at zero; personal phone views show the countdown but stay muted by default so the room doesn't fill with simultaneous phone beeps — toggle available if someone wants their own sound.

**Value tracking**: `server/services/scryfall.ts` proxies Scryfall's public REST API (`/cards/autocomplete`, `/cards/named`) server-side with a short cache (respects Scryfall's rate-limit guidance, sets a descriptive User-Agent). Adding a pull = type a name, pick from autocomplete, price (EUR) + card image snapshot into `CardPull`. Display: per-pod card gallery sorted by price with running total (mirrors the old "Value" tables but with images), a per-tournament "Best Pulls of the Weekend" rollup, and an all-time cross-year "Hall of Fame" page (biggest pulls ever + past champions list) — a natural extension given multi-year data will already be imported.

**Auth & multi-tenancy**: Cookie sessions via `@fastify/secure-session` (encrypted cookie, no Redis/session-store dependency — keeps the stack to just app+db). Landing page offers "create an organization" (self-service: org name/slug + first organizer account) or "log in." Public pages are path-scoped and unauthenticated: `/o/<slug>/tournaments/<id>` (Gesamtwertung + pod list) and `/o/<slug>/tournaments/<id>/pods/<podId>` (pairings/standings/timer/gallery) — these replace the shareable Outline doc links. Everything else (creating tournaments/pods, running rounds, entering results) requires organizer login, scoped to their own org only.

**History import**: `scripts/import-legacy.ts`, a Prisma-client script that reads a legacy-data JSON file supplied at runtime (never compiled into the repo — see README's "History import" section for why and how). Where a pod's source only has final standings (many round-by-round tables were left empty in practice), it's imported as a `COMPLETED` pod with final points but no synthetic match-by-match data — no fabricating pairings that never got recorded. Card-pull Value data imports cleanly since that data is complete. Run once after first deploy: `docker compose exec app node server/dist/scripts/import-legacy.js /path/to/data.json`.

## Build order

0. **Project bootstrap**: create the repo, write `CLAUDE.md` + `PLAN.md` (this file) + `STEPS.md` before any code. ✅ done.
1. Repo scaffold: Fastify + Prisma + Postgres skeleton, Dockerfile (multi-stage), `docker-compose.yml`, `.env.example`, health check endpoint. Confirm it builds and boots via `docker compose up`.
2. Auth + multi-tenancy: org signup/login, session middleware, `Player` roster CRUD.
3. Tournament + Pod CRUD: organizer creates a tournament, adds pods with per-pod Swiss config (rounds, points, team mode, format, date).
4. Pairing engine: manual + auto for round 1, auto (score-group + weekend-coverage-aware) for later rounds, bye handling, swap-before-lock UI, coverage matrix.
5. Match result entry + pod standings page (points/OMW/GW/OGW).
6. Weekend Gesamtwertung computation + display (average-ranked, total shown).
7. Socket.IO realtime layer + round timer with chime (Display Mode).
8. Value tracking: Scryfall proxy, autocomplete, card gallery, weekend/all-time rollups.
9. Public read-only pages + visual polish pass (will consult the `dataviz` skill for the Gesamtwertung/standings displays specifically, since "displayed in a nice way" was an explicit ask). **Design approved 2026-08-24** — dark mode only for v1 (light is a deliberate v2, not an oversight), a "trophy plaque" direction (Georgia serif for headlines/hero numbers, system sans + tabular figures for data, one antique-gold accent reserved for identity/ranking, status colors kept separate). Full rationale and the reviewed mockup (built with real 2025 Sommer data) are saved at `design/approved-design-mockup.html` in this repo — read it before touching colors/type/layout in the real app rather than re-deriving the system from scratch.
10. History import script, run against transcribed legacy data, spot-check against the original Outline docs.
11. README, LICENSE (defaulting to MIT unless Tobias would rather AGPL to discourage closed-source SaaS forks — easy to swap before first push), final `docker-compose.yml`/`.env.example` pass.
12. Deploy to DaxLite (`/opt/docker/arcane-projects/limited-gauntlet/compose.yaml`, Arcane-managed, matching existing convention) — Tobias runs this step since it touches his live infra; hand over the exact compose file + steps. Once live, add a `services/daxlite.md` entry in claude-memory to document it, per existing conventions there.

Steps 1-12 each get checked off in `STEPS.md` as they land, so progress survives across sessions regardless of context window resets. This is a multi-session build, not a single pass — work through the numbered steps in order and check in as major pieces (pairing engine, Gesamtwertung, realtime) land, rather than going silent until everything's done.

## Verification

- Unit-level: standings/pairing math (points, OMW/GW/OGW, average-based Gesamtwertung, team point crediting) gets test coverage against real historical tournament numbers (pseudonymized in the test fixtures, real data kept outside this repo — see README's "History import" section) as known-good fixtures.
- End-to-end: run a real simulated weekend through the UI (create org → tournament → 2-3 pods, mixed 1v1 and team → full pairing/result/timer flow → verify Gesamtwertung and coverage matrix look right) using the `run` skill to launch and click through it before calling any step done.
- History import: after running the import script, diff the resulting Gesamtwertung pages against the original Outline tables for all 4 tournaments.
- `docker compose up` from a clean checkout is the final smoke test — must come up with just `.env` filled in, no manual DB steps.

## Historical reference data

The real 4-year tournament history (player names, per-pod points, round-by-round Battlebond results, card-pull values) that was originally transcribed here during planning has been moved out of this repo entirely — it's someone else's real personal data (a friend group's names and game results), not project fixtures, and doesn't belong in git history even on a private remote.

It now lives in `legacy-data.local.json` at the repo root, gitignored, supplied to `import-legacy.ts` at runtime rather than compiled in — see the README's "History import" section for the file's shape and how the script consumes it. The one piece of that data actually load-bearing for the codebase — the reconstructed Battlebond-style round-by-round results used as the Step 5 standings acceptance test — is transcribed directly (with pseudonymized names) in `server/src/services/standings.test.ts`'s own comments instead of duplicated here.

The design conclusions that data drove are still load-bearing and stay documented above in Architecture: team pods credit each member the team's full points (not divided), and Gesamtwertung ranks by average points per pod played rather than raw total, specifically because it produces a real, meaningful re-rank on real data (verified in `gesamtwertung.test.ts`).

### Feedback doc (wishes noted for context, not all in scope for this build)
- Max 2 drafts/day (scheduling preference, not a system feature)
- Constructed event support → covered by the format-agnostic core (Pod.format = CONSTRUCTED)
- Better food-planning workflow (out of scope — not a tournament-tracking feature)
