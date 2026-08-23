# LimitedGauntlet — self-hosted MTG Limited tournament tracker

This is the canonical architecture/design doc for the project. It was drafted collaboratively with Claude Code (planning session, 2026-08-23) against ~4 years of real tournament history pulled from Tobias's Outline instance. `STEPS.md` in this repo tracks build progress against the order laid out here — check that file for "what's done, what's next."

## Context

Tobias runs a yearly weekend MTG Limited event (8-10 players, ~6 draft/sealed pods across Fri/Sat/Sun) and currently tracks pairings on a third-party site (mtgarena.appspot.com) plus manually maintains standings, a weekend "Gesamtwertung" (overall points table), and a "best pulls" value leaderboard in Outline docs. The external pairing tool is annoying to use and none of it is connected — Gesamtwertung has to be hand-copied from each pod's final standings after the fact.

Goal: replace this with a self-hosted, open-source Docker app that (a) runs the whole weekend end-to-end — pairing, results, live standings, timer — and (b) is built as a real multi-group OSS tool, not a single-purpose script, since Tobias wants to publish it.

Requirements were gathered via extensive Q&A and confirmed against 4 years of historical Outline data (2024 Bad Gechingen, 2025 Winter/Sommer Eichstätt, 2026 Sommer in progress). Key confirmed decisions:
- **Multi-tenant**: one deployment hosts multiple isolated organizations, each with their own admin login + roster.
- **Format-agnostic core**: Swiss/team pairing and standings engine works for any format; Limited-specific extras (pack notes, value tracking) are optional per pod.
- **Team pods** (e.g. 2025 Sommer's Battlebond 2HG event) credit each team member the team's **full** match points toward Gesamtwertung — confirmed against real data (team scored 5, all 3 members show 5).
- **Gesamtwertung ranking = average points per pod played** (not raw total), normalizing for partial attendance (e.g. "Kit, nur Samstag"). Raw total still shown alongside.
- **Pairing**: auto Swiss by default, manual override always available (especially round 1), and — new capability the old tool didn't have — pairing suggestions should factor in the **whole weekend's opponent history** across pods, nudging toward "everyone plays everyone at least once," not just avoiding repeats within one pod.
- **Round timer** with audible signal tone, real-time synced across devices.
- **Result entry v1**: organizer-only (matches how the iPad-as-terminal workflow works today). v2 (not in this build): private per-player links to self-submit, organizer finalizes.
- **Value tracking**: auto Scryfall price/image lookup instead of manual price typing.
- **Public read-only pages**, no login needed to view standings — organizer login only for running the event.
- **Import the 4 years of existing Outline history** so Gesamtwertung/Hall-of-Fame data is complete from day one.
- **Deploy target**: DaxLite via Docker Compose (Arcane-managed), Postgres as a second container.

## Architecture

**Organizations & multi-year history**: An `Organization` is the persistent group (e.g. Tobias's "GP Eichstätt" crew), not a single weekend. It owns one `Player` roster that persists across years (fixing the old name-drift problem — Devon/Devon, Philipp/Phillip typos in Outline). An org creates a new `Tournament` row for each yearly GP weekend (2024 Bad Gechingen, 2025 Winter, 2025 Sommer, 2026 Sommer, ... indefinitely) — this is already how the data model above is shaped, just making it explicit: **org : tournament is one-to-many, unbounded**. Each `Tournament` has its own `startDate`/`endDate`. Cross-tournament views (the all-time "Hall of Fame," career-average leaderboard) query across all of an org's tournaments.

`Pod` additionally gets a `date` field (calendar date the pod runs on, e.g. the actual Saturday) separate from `Round.startedAt` (precise timestamp when a specific round's clock starts) — the old docs organized pods as "Freitag / Samstag 1 / Samstag - Chaosdraft / ..." which is a day label, not just a sequence number, and Tobias flagged that date tracking needs to be explicit rather than implied.

**Stack**: Node.js/TypeScript throughout — Fastify (API + WebSocket) + Prisma + PostgreSQL on the backend, React + Vite + TypeScript + Tailwind on the frontend, Socket.IO for realtime. Single Docker image (multi-stage build: Vite build → static assets, tsc build → backend dist, final slim Node runtime serves API, WebSocket, and the SPA's static files off one port). `docker-compose.yml` ships two services: `app` + `db` (postgres:16-alpine). Prisma Migrate runs automatically on container start so self-hosters never touch SQL directly, and Prisma Studio is available for the hobbyist-friendly "just look at the data" case.

Rationale: one language end-to-end keeps this approachable for an OSS project maintained by a non-full-time-programmer; Fastify+Socket.IO handles persistent WebSocket connections cleanly in a standalone container (unlike serverless-oriented frameworks); Prisma's migration tooling + Studio GUI minimizes DB maintenance burden.

**Data model** (Prisma schema, `prisma/schema.prisma`):
- `Organization` (slug, name) — the tenancy boundary. All other org-scoped tables FK to it.
- `OrganizerAccount` (orgId, email, passwordHash via argon2, name) — login-capable users; multiple organizers per org allowed (e.g. co-organizing friend).
- `Player` (orgId, displayName) — persistent roster, reused across years to avoid the name-drift seen in the old docs (Devon/Devon, Philipp/Phillip).
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

**History import**: `scripts/import-legacy.ts` + a hand-transcribed `scripts/legacy-data.json` (built from the 4 tournaments already pulled from Outline: 2024 Bad Gechingen, 2025 Winter, 2025 Sommer, 2026 Sommer-in-progress) inserted via the Prisma client. Where a pod's Outline doc only has final standings (many round-by-round tables were left empty in practice), it's imported as a `COMPLETED` pod with final points/OMP/GWP/OGP but no synthetic match-by-match data — no fabricating pairings that never got recorded. Card-pull Value tables import cleanly since that data is complete. Run once after first deploy: `docker compose exec app node dist/scripts/import-legacy.js`.

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
9. Public read-only pages + visual polish pass (will consult the `dataviz` skill for the Gesamtwertung/standings displays specifically, since "displayed in a nice way" was an explicit ask).
10. History import script, run against transcribed legacy data, spot-check against the original Outline docs.
11. README, LICENSE (defaulting to MIT unless Tobias would rather AGPL to discourage closed-source SaaS forks — easy to swap before first push), final `docker-compose.yml`/`.env.example` pass.
12. Deploy to DaxLite (`/opt/docker/arcane-projects/limited-gauntlet/compose.yaml`, Arcane-managed, matching existing convention) — Tobias runs this step since it touches his live infra; hand over the exact compose file + steps. Once live, add a `services/daxlite.md` entry in claude-memory to document it, per existing conventions there.

Steps 1-12 each get checked off in `STEPS.md` as they land, so progress survives across sessions regardless of context window resets. This is a multi-session build, not a single pass — work through the numbered steps in order and check in as major pieces (pairing engine, Gesamtwertung, realtime) land, rather than going silent until everything's done.

## Verification

- Unit-level: standings/pairing math (points, OMW/GW/OGW, average-based Gesamtwertung, team point crediting) gets test coverage against the actual historical numbers pulled from Outline (e.g. 2025 Sommer: Devon 28 total, ranked #1) as known-good fixtures.
- End-to-end: run a real simulated weekend through the UI (create org → tournament → 2-3 pods, mixed 1v1 and team → full pairing/result/timer flow → verify Gesamtwertung and coverage matrix look right) using the `run` skill to launch and click through it before calling any step done.
- History import: after running the import script, diff the resulting Gesamtwertung pages against the original Outline tables for all 4 tournaments.
- `docker compose up` from a clean checkout is the final smoke test — must come up with just `.env` filled in, no manual DB steps.

## Historical reference data (source for import + fixtures)

Pulled from Outline (`GP Eichstätt` collection) during planning. Kept here so the import script and standings-engine test fixtures don't need to re-fetch from Outline.

### 2025 Sommer GP Eichstätt — Gesamtwertung
| | Chaos Draft | Kaldheim | Modern Horizons 1 | Edge | Battlebond | Gesamt |
|---|---|---|---|---|---|---|
| Alex | 3 | 4 | 0 | 3 | 5 | 15 |
| Bailey | 0 | 0 | 0 | 7 | 2 | 9 |
| Casey | 6 | 7 | 0 | 3 | 5 | 21 |
| Devon | 6 | 7 | 7 | 4 | 4 | 28 |
| Emery | 3 | 0 | 0 | 0 | 5 | 8 |
| Finley | 6 | 4 | 3 | 7 | 4 | 24 |
| Harper | 0 | 6 | 3 | 4 | 4 | 17 |
| Gray | 9 | 3 | 6 | 6 | 2 | 26 |
| Tobias | 3 | 3 | 7 | 0 | 4 | 17 |

Final placement: 1 Devon (28), 2 Gray (26), 3 Finley (24), 4 Casey (21), 5 Harper/Tobias (17), 7 Alex (15), 8 Bailey (9), 9 Emery (8).

Battlebond was a team (2HG-style) pod — confirmed team scoring source: Alex+Casey+Emery (team, 5 pts) → all three show 5 in the table above; Tobias+Harper (4 pts) → both show 4; Devon+Finley (4 pts) → both show 4; Bailey+Gray (2 pts) → both show 2. This is the data that confirmed the "full team points to each member" rule.

**Battlebond round-by-round results** (used as the Step 5 standings acceptance test, `server/src/services/standings.test.ts`) — a 4-team, best-of-1, 3-round round robin. Rounds 1-2 are stated directly in the original Outline doc; Round 3 wasn't recorded there, but is uniquely determined by the stated final standings (hand-solved: both Round 3 matches were draws, which is the only combination that produces the final points exactly) — cross-checked by hand against the OMW%/GW%/OGW% formula (opponent floor 33.33%, draws contribute 0 games since no game was actually decided) before implementing, all four rows matched exactly:
- R1: Tobias+Harper vs Devon+Finley → Devon+Finley wins 1-0. Bailey+Gray vs Alex+Casey+Emery → DRAW.
- R2: Devon+Finley vs Alex+Casey+Emery → Alex+Casey+Emery wins 1-0. Tobias+Harper vs Bailey+Gray → Tobias+Harper wins 1-0.
- R3 (reconstructed): Tobias+Harper vs Alex+Casey+Emery → DRAW. Bailey+Gray vs Devon+Finley → DRAW.
- Final: Alex+Casey+Emery 5/40.74/100/44.44, Tobias+Harper 4/44.44/50/61.11, Devon+Finley 4/44.44/50/61.11, Bailey+Gray 2/48.15/0/66.67 (points/OMW%/GW%/OGW%).

### 2025 Winter GP Eichstätt — Gesamtwertung
| | Mystery 2 Draft | Chaos Draft | Innistrad Remastered Draft | Gesamt |
|---|---|---|---|---|
| Alex | 4 | 0 | 3 | 7 |
| Bailey | 3 | 7 | 3 | 13 |
| Casey | 1 | 6 | 0 | 7 |
| Devon | 7 | 7 | 7 | 21 |
| Finley | 3 | 1 | 6 | 10 |
| Gray | 6 | 6 | 7 | 19 |
| Harper | 3 | 3 | 6 | 12 |
| Tobias | 7 | 4 | 3 | 14 |

Final placement: 1 Devon (21), 2 Gray (19), 3 Tobias (14), 4 Bailey (13), 5 Harper (12), 6 Finley (10), 7 Alex/Casey (7).

### 2024 GP Bad Gechingen — Gesamtwertung
| | Mystery Draft | Vintage Cube | Bloomburrow Sealed | Modern Horizons 3 Draft | Eldritch Moon Draft | Chaos Draft | Gesamt | Durchschnitt |
|---|---|---|---|---|---|---|---|---|
| Alex | 7 | / | 8 | 3 | 3 | 6 | 27 | 5.4 |
| Bailey | 7 | 3 | 4 | 6 | 3 | 1 | 24 | 4.0 |
| Casey | 7 | 3 | 4 | 7 | 3 | 6 | 30 | 5.0 |
| Devon | 3 | 6 | 8 | 7 | 6 | 6 | 36 | 6.0 |
| Indigo | 3 | / | 7 | 1 | 0 | 1 | 12 | 2.4 |
| Jules | 3 | 6 | 5 | 3 | 3 | 3 | 23 | 3.8 |
| Finley | 6 | 7 | 2 | 5 | 7 | 6 | 33 | 5.5 |
| Gray | 4 | 7 | 8 | 3 | 6 | 3 | 31 | 5.2 |
| Harper | 0 | 0 | 1 | 0 | 6 | 3 | 10 | 1.7 |
| Tobias | 3 | 3 | 5 | 7 | 7 | 9 | 34 | 5.6 |

`/` = did not play Vintage Cube (excluded from that player's events-played count, matching the average-based Gesamtwertung rule). Final placement in the original doc was by raw total, not average — the new average-based rule re-ranks this on import; worth a quick sanity comparison against the old doc when the import script runs, not a correctness bug.

**Exact re-rank (hand-verified when building Step 6, `server/src/services/gesamtwertung.ts`):** by average, Alex (27 pts / 5 pods attended = 5.4 avg) jumps from rank 6 (by raw total) to **rank 4**, passing Gray (31/6 = 5.17) and Casey (30/6 = 5.0) despite a lower total. Full average-ranked order: 1 Devon (6.0), 2 Tobias (5.667), 3 Finley (5.5), 4 Alex (5.4), 5 Gray (5.167), 6 Casey (5.0), 7 Bailey (4.0), 8 Jules (3.833), 9 Indigo (2.4), 10 Harper (1.667). Indigo also moves from raw-total-rank 9 to average-rank 9 unchanged (both his and Alex's absence only reshuffles who's above/below the 5-6-event boundary, not the bottom of the table). Note the original doc's own "Durchschnitt" column has minor rounding artifacts vs. the exact values here (e.g. shows Tobias at 5.6, exact value is 5.667) — expected, not a bug to fix on import.

### 2026 Sommer GP Eichstätt (in progress at planning time)
Participants: Kit (nur Samstag), Indigo, Casey, Devon, Finley, Gray, Harper, Tobias Arendt.
Pods: Freitag, Samstag 1, Samstag - Chaosdraft, Samstag - 3, Sonntag - 1, Sonntag - 2. Location: Rebdorferstraße 66, 85072 Eichstätt. No results recorded yet at planning time (2026-08-23) — import as an open/in-progress tournament with roster only.

### Value tracking examples (for card-gallery fixtures)
2025 Sommer Battlebond top pulls: Morphic Pool €25.91, Doubling Season €19.67, Spellseeker €14.47, Diabolic Intent €11.47, Seedborn Muse €9.70 (total €143.96 — highest single-pod value across all imported years, good smoke-test fixture for the "Hall of Fame" page).

### Feedback doc (wishes noted for context, not all in scope for this build)
- Max 2 drafts/day (scheduling preference, not a system feature)
- Constructed event support → covered by the format-agnostic core (Pod.format = CONSTRUCTED)
- Better food-planning workflow (out of scope — not a tournament-tracking feature)
