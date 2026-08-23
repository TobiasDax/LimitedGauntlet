# Build steps

Granular checklist. Check items off as they land. This file is the first thing to read in a new session — it tells you exactly what's done and what's next. Full rationale for any step lives in `PLAN.md`.

**Status: Steps 0-3 done. Next up: Step 4 (pairing engine).**

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

## Step 2 — Auth + multi-tenancy ✅
- [x] `POST /api/auth/signup`: creates Organization + first OrganizerAccount together in one Prisma transaction (no dangling org if account creation fails), zod-validated, argon2 password hashing, sets session on success
- [x] `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- [x] `@fastify/secure-session` cookie sessions — key from `SESSION_SECRET` env var (32-byte hex, fails fast at boot if missing/wrong length), `SESSION_COOKIE_SECURE` env var to control the cookie's `Secure` flag (default off so local/LAN HTTP use isn't silently broken; flip on behind a TLS reverse proxy)
- [x] `requireAuth` preHandler hook (`server/src/auth/middleware.ts`): loads the organizer from the session, attaches `request.organizer = {id, orgId, email, name}`, 401s otherwise. This is the entire multi-tenancy boundary — every org-scoped route filters by `request.organizer.orgId`
- [x] `Player` roster CRUD (`GET/POST/PATCH/DELETE /api/players`) — org-scoped; update/delete use `updateMany`/`deleteMany` with `{id, orgId}` in the `where` clause (not a plain `update`/`delete` by id) so a request can never touch another org's row, by construction not just convention
- [x] Verify: full live exercise against a real running stack (not just reasoning about the code) — created two separate orgs, confirmed each only lists their own players, confirmed Org B's PATCH/DELETE against Org A's known player ID both return 404 (not a leak, not a silent no-op) while Org A's own PATCH/DELETE succeed, confirmed `/api/auth/me` and `/api/players` both 401 after logout and with no cookie, confirmed duplicate org slug and wrong password are rejected with the right status codes

## Step 3 — Tournament + Pod CRUD ✅
- [x] Tournament CRUD (`server/src/routes/tournaments.ts`): create/get/list/update/delete, org-scoped via `updateMany`/`deleteMany` with `{id, orgId}`, same pattern as Player
- [x] `TournamentPlayer` attach/detach (`POST`/`DELETE /api/tournaments/:id/players`), upsert-based so attaching twice is a no-op not an error
- [x] Pod CRUD (`server/src/routes/pods.ts`) nested under tournament — org-scoping here is one hop deeper (`pod.tournament.orgId`), confirmed Prisma's relation filters work in `updateMany`/`deleteMany` `where` clauses, not just `findMany`
- [x] Found and fixed a real bug before it shipped: the first draft of the pod-update schema used `podCreateSchema.partial()`, but Zod re-applies `.default()` values whenever a field is `undefined` — which is exactly what an omitted PATCH field looks like. That would've silently reset `pointsWin`/`pointsDraw`/`pointsLoss`/`roundCount`/etc. back to their defaults on every partial update that didn't mention them. Fixed by writing `podUpdateSchema` from scratch with plain `.optional()` (no defaults) on every field. Caught by reasoning about it before testing, then confirmed with a live PATCH that changes only `status` and checked the other fields survived untouched.
- [x] `Entrant` creation for both individual pods (`{playerId}`) and team pods (`{teamName, playerIds[]}`, creates Team + TeamMembers + Entrant in one transaction)
- [x] Double-booking guard: a player can't become an entrant twice in the same pod, whether individually or via two different teams — checked via `getPlayerIdsAlreadyInPod()` before creating, 409 on conflict
- [x] `DELETE /api/entrants/:id`: team entrants delete the Team (cascades to Entrant + TeamMember rows), individual entrants delete directly
- [x] Verify: recreated the real 2025 Sommer Battlebond pod (4 teams of 2-3 — Alex+Casey+Emery, Tobias+Harper, Devon+Finley, Bailey+Gray — 3 rounds) purely through the live API against the actual historical roster from PLAN.md. Confirmed the returned structure matches exactly, confirmed double-booking Emery into a second team 409s, confirmed the PATCH-defaults fix holds under a real request, confirmed deleting a team entrant cascades cleanly, and confirmed Org B gets 404 (not data, not a silent no-op) trying to read/delete Org A's tournament or pod by ID.

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
