# Build steps

Granular checklist. Check items off as they land. This file is the first thing to read in a new session — it tells you exactly what's done and what's next. Full rationale for any step lives in `PLAN.md`.

**Status: Steps 0-1 done. Next up: Step 2 (auth + multi-tenancy).**

## Step 0 — Project bootstrap ✅
- [x] Create `~/Projects/LimitedGauntlet/`, `git init`
- [x] Write `CLAUDE.md`
- [x] Write `PLAN.md` (incl. historical reference data transcribed from Outline)
- [x] Write `STEPS.md` (this file)
- [x] Add `~/Projects/LimitedGauntlet/CLAUDE.md` line to claude-memory's `projects.md` "Linked CLAUDE.md files" section
- [x] First commit (`407c608`)

## Step 1 — Repo scaffold ✅
- [x] `package.json` workspace layout: npm workspaces, `server/` + `client/`
- [x] `server/`: Fastify app skeleton, TypeScript strict config, `/api/healthz` endpoint (queries the DB, not just a static 200 — proves the Prisma connection works too)
- [x] `server/prisma/schema.prisma`: initial schema per PLAN.md's data model section (Organization, OrganizerAccount, Player, Tournament, TournamentPlayer, Pod, Team, TeamMember, Entrant, Round, Match, CardPull)
- [x] First Prisma migration (`20260823205506_init`), verified applies cleanly via both `migrate dev` (against a live diff) and `migrate deploy` (the production/entrypoint path) against a fresh Postgres
- [x] `client/`: Vite + React 19 + TS strict + Tailwind v4 skeleton, placeholder page that calls `/api/healthz` through TanStack Query to prove the front-to-back wiring works
- [x] `Dockerfile`: multi-stage (deps → client-build / server-build → runtime), builds clean, final image serves the SPA + static assets + `/api/healthz`
- [x] `docker-compose.yml` + `.env.example`: `app` + `db` (postgres:16-alpine), healthcheck-gated startup order
- [x] `docker/entrypoint.sh` runs `prisma migrate deploy` before starting the server
- [x] Verify: `docker compose up` from a clean checkout (fresh `.env` from the example, no manual DB steps) — confirmed migrations auto-apply, `/api/healthz` returns `{"status":"ok"}`, SPA HTML + JS/CSS assets all serve with 200s. Torn down cleanly after.
- [x] Security: caught and fixed a path-traversal vulnerability in the pinned `@fastify/static` version during `npm audit` (was `^8.0.4`, bumped to `^10.1.3`) before it ever ran; also overrode a transitive `deepmerge-ts` vuln pulled in by Prisma's dev-only config loader (`"overrides": {"deepmerge-ts": "^8.0.0"}` in root `package.json`) — verified the override doesn't break `prisma generate`/`migrate`. `npm audit` is clean (0 vulnerabilities).
- Note: evaluated Prisma 7 (latest stable) but it moves `datasource.url` out of `schema.prisma` into a new `prisma.config.ts` + driver-adapter system that's still quite fresh — reverted to Prisma 6.19.x (latest 6.x, still receiving fixes) to keep the stack boring and approachable. Revisit this decision once Prisma 7's config system has matured, not before.

## Step 2 — Auth + multi-tenancy
- [ ] `OrganizerAccount` signup flow: create org (name/slug) + first organizer account together
- [ ] Login/logout, `@fastify/secure-session` cookie sessions, argon2 password hashing
- [ ] Auth middleware: org-scoped route protection (an organizer can only touch their own org's data)
- [ ] `Player` roster CRUD (add/edit/list players within an org) — org-scoped, persists across tournaments
- [ ] Verify: two separate orgs created, confirm zero data leakage between them (can't see/edit the other org's players via API even with a valid session)

## Step 3 — Tournament + Pod CRUD
- [ ] Tournament CRUD: create/edit within an org (name, startDate, endDate, location, status)
- [ ] `TournamentPlayer`: attach/detach roster players to a specific tournament (who's attending this weekend)
- [ ] Pod CRUD within a tournament: name, date, format enum, sequenceOrder, isTeamEvent, teamSize, roundCount, matchFormat, pointsWin/Draw/Loss, roundLengthMinutes, packConfig, rarepicUrl
- [ ] `Entrant` creation: attach players (or form ad-hoc Teams + TeamMembers) to a specific pod
- [ ] Verify: recreate one real historical pod's setup (e.g. 2025 Sommer's Battlebond: 4 teams of 2-3, 3 rounds) purely through the CRUD UI

## Step 4 — Pairing engine
- [ ] `server/services/pairing.ts`: score-group grouping + greedy pair-with-backtracking
- [ ] Hard-avoid: no repeat opponents within the same pod
- [ ] Soft-avoid: weighted cost penalty for opponents already played elsewhere in the tournament this weekend (weekend coverage nudge)
- [ ] Bye handling: lowest score group, no prior bye this pod, full win points
- [ ] Manual pairing mode: organizer assigns entrants to tables directly (available any round, not just round 1)
- [ ] Swap UI: adjust two entrants' tables before locking an auto-generated round
- [ ] Weekend coverage matrix: player × player grid, times-played count, organizer-facing + public page
- [ ] Verify: simulate a full 8-player, 3-round pod and confirm no repeat opponents; simulate a 2-pod weekend and confirm the coverage nudge measurably reduces cross-pod repeats vs. plain per-pod Swiss

## Step 5 — Match results + pod standings
- [ ] Result entry UI (organizer-only, per PLAN.md's v1 scope): win/loss/draw + games won per side
- [ ] `server/services/standings.ts`: match points, GW%, OMW%/OGW% (33% floor per MTR)
- [ ] Pod standings page: points/OMW/GW/OGW table, sorted correctly
- [ ] Verify against a real historical pod: 2025 Sommer Battlebond's final standings table (Alex+Casey+Emery 5pts/40.74/100/44.44, etc. — see PLAN.md) reproduces exactly from re-entered match results

## Step 6 — Weekend Gesamtwertung
- [ ] Compute eventsPlayed / totalPoints / average per player per tournament (team pods → full team points per member)
- [ ] Gesamtwertung page: ranked by average desc, total shown alongside, tiebreak by total then name
- [ ] Unit tests against all 3 completed historical tournaments' fixtures in PLAN.md (2024 Bad Gechingen, 2025 Winter, 2025 Sommer) — confirm computed rankings match (noting 2024's original doc ranked by raw total, not average, so expect an intentional re-rank there, not a bug)

## Step 7 — Realtime + round timer
- [ ] Socket.IO server setup, rooms per pod + per tournament
- [ ] Broadcast events: round started/stopped, result submitted, pairings published, card pull added
- [ ] Frontend: TanStack Query cache invalidation on socket events
- [ ] Round timer: `Round.startedAt`/`endsAt`, client-side countdown, organizer "+5 min" nudge
- [ ] Display Mode: audible chime via Web Audio at zero; personal views default muted
- [ ] Verify: two browser windows (simulating organizer phone + shared display), submit a result in one, confirm the other updates without refresh; let a timer run out in Display Mode and confirm the chime fires

## Step 8 — Value tracking
- [ ] `server/services/scryfall.ts`: proxy `/cards/autocomplete` + `/cards/named`, short cache, proper User-Agent per Scryfall's API guidelines
- [ ] Add-pull UI: name autocomplete → price (EUR) + image snapshot into `CardPull`
- [ ] Per-pod card gallery, sorted by price, running total
- [ ] Per-tournament "Best Pulls of the Weekend" rollup
- [ ] All-time cross-tournament "Hall of Fame" page
- [ ] Verify: re-add the 2025 Sommer Battlebond pulls (Morphic Pool, Doubling Season, Spellseeker, Diabolic Intent, Seedborn Muse — total €143.96, see PLAN.md) and confirm the gallery total matches

## Step 9 — Public pages + polish
- [ ] `/o/<slug>/tournaments/<id>` and `.../pods/<podId>` public unauthenticated read-only pages
- [ ] **Load the `dataviz` skill before this step** — explicit ask was for Gesamtwertung/standings to be "displayed in a nice way," not just functional tables
- [ ] Responsive pass: usable on a phone (players checking standings) and on a shared iPad/TV (Display Mode)
- [ ] Light/dark theme support

## Step 10 — History import
- [ ] `scripts/legacy-data.json`: transcribe PLAN.md's historical reference section (all 4 tournaments) into structured JSON
- [ ] `scripts/import-legacy.ts`: Prisma-client-based import script
- [ ] Run it, then diff every resulting Gesamtwertung page against the original Outline tables (expect the 2024 re-rank noted above, nothing else)

## Step 11 — README, LICENSE, packaging polish
- [ ] `README.md`: what it is, screenshots (once there's UI to screenshot), quick start, config env vars
- [ ] `LICENSE` — MIT by default; ask Tobias if AGPL is preferred before first push (guards against closed-source SaaS forks)
- [ ] Final `.env.example` pass — everything needed to run listed, nothing missing

## Step 12 — Deploy to DaxLite
- [ ] Hand Tobias the exact compose file for `/opt/docker/arcane-projects/limited-gauntlet/compose.yaml` + steps — **he runs this**, not Claude (touches live infra)
- [ ] Once live: add a `services/daxlite.md` entry in `claude-memory`
