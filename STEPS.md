# Build steps

Granular checklist. Check items off as they land. This file is the first thing to read in a new session — it tells you exactly what's done and what's next. Full rationale for any step lives in `PLAN.md`.

**Status: Steps 0-5 done. Next up: Step 6 (weekend Gesamtwertung).**

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

## Step 4 — Pairing engine ✅
- [x] `server/src/services/podStats.ts`: per-pod match points, opponent history, and bye history computed live from `Round`/`Match` rows (no separate stored-state table, per PLAN.md's design decision)
- [x] `server/src/services/weekendHistory.ts`: cross-pod, player-level "who's played whom this weekend" counts, resolving team entrants down to their member players so 2HG-style matches count every member of side A against every member of side B
- [x] `server/src/services/pairing.ts`: score-group sort (shuffled on round 1 for a genuine random draw, points-desc thereafter) + greedy pair-with-backtracking. Hard-avoid (within-pod repeat) is `Infinity` cost, so it's a true constraint; soft-avoid (repeat anywhere else this weekend) is a large-but-finite weight, so it degrades gracefully instead of failing when full avoidance becomes mathematically impossible
- [x] Bye handling: lowest score, no prior bye this pod, falls back to lowest score regardless if everyone's already had one
- [x] `server/src/routes/rounds.ts`: full round lifecycle — auto pairing (`POST /api/pods/:id/rounds`), manual pairing (`POST /api/pods/:id/rounds/manual`, validated so every active entrant appears exactly once and the bye count matches parity — no silent partial pairings), swap two entrant slots between pending matches (`POST /api/rounds/:id/swap`, rejects swapping a bye slot), start (locks further pairing edits, computes `endsAt` from `Pod.roundLengthMinutes`), result entry (`PATCH /api/matches/:id/result`, only while the round is ACTIVE), complete (blocked until every non-bye match has a result). Round-sequencing is enforced (`previous_round_not_completed`, `round_count_exceeded`) so pairing for round N always sees complete data for rounds 1..N-1
- [x] `GET /api/tournaments/:id/coverage`: weekend coverage matrix (player × player times-played), same underlying data the pairing soft-avoid uses
- [x] Found and fixed a real gap during live testing: `Entrant` creation didn't attach the player to `TournamentPlayer`, so someone actively playing in a pod could be invisible in the coverage view (and would have been in Gesamtwertung later) unless the organizer separately called the roster-attach endpoint. Fixed with `syncTournamentAttendance()` — upserted inside the same transaction as entrant/team creation, both branches (individual and team)
- [x] Verify — deterministic Vitest suite (`server/src/services/pairing.test.ts`) against a real throwaway Postgres, not mocks: (1) a full 8-entrant, 3-round pod never repeats an opponent, confirmed across 9 consecutive runs despite round-1's randomized draw; (2) bye assignment goes to a different entrant each round until everyone's had one; (3) given a completed Pod A where two pairs have already met, Pod B's fresh round-1 pairing for the same 4 players always avoids those pairs when an equally-valid alternative exists — this one is provably deterministic, not just probably-usually-true, because the crafted 4-player scenario has an all-zero-cost perfect matching that greedy-lowest-cost-first always finds before ever considering the higher-cost repeat option
- [x] Verify — full HTTP round-lifecycle exercised live against a running stack (not just the pure algorithm): 6-player pod through rounds 1-2 auto-paired with a verified zero repeat opponents between them, swap tested before lock and confirmed blocked after `start`, `complete` blocked until all results are in then succeeds once they are, manual pairing's validation confirmed rejecting both an incomplete roster and a wrong bye count, and cross-org 404s confirmed on round start / match result / coverage (three hops from org: round → pod → tournament → org)

## Step 5 — Match results + pod standings ✅
- [x] Result entry (organizer-only, per PLAN.md's v1 scope) — already built in Step 4 as necessary plumbing (`PATCH /api/matches/:id/result`). Nothing left to do here beyond a frontend for it in Step 9.
- [x] Extended `podStats.ts`'s core `tallyMatches()` with `matchesPlayed`/`gamesWon`/`gamesPlayed` tracking (byes count as a played round + a clean 2-0; a real match still `PENDING` correctly contributes to nothing yet, which matters for live mid-round standings even though it's a no-op for pairing since round-sequencing guarantees prior rounds are always complete by the time pairing looks at them) — added `computeAllPodStats()` alongside the existing round-cutoff `computePodStats()` rather than duplicating the tally logic
- [x] `server/src/services/standings.ts`: `computePodStandings()` — match-win% and game-win% per entrant, then OMW%/OGW% as the average of each opponent's own (floored-at-33%) percentage, sorted points → OMW% → GW% → OGW% per MTR tiebreaker order. Pulls the full entrant list from the DB (not just entrants who've played something yet) so a fresh pod shows everyone at zero rather than an empty table
- [x] `GET /api/pods/:id/standings` — full table with player/team names joined in
- [x] Verify — before writing any code, hand-reconstructed the actual 2025 Sommer Battlebond round-by-round results from the original Outline doc (Rounds 1-2 were stated directly; Round 3 wasn't recorded there, but is uniquely determined by the stated final standings — both Round 3 matches were draws, confirmed by hand-solving the points backward, then cross-checked all four rows' OMW%/GW%/OGW% by hand against the planned formula before implementing). Then wrote it as a deterministic Vitest test (`standings.test.ts`) that recreates the exact pod/teams/rounds/results and asserts the computed output against the real numbers — **all four rows match exactly**: Alex+Casey+Emery 5/40.74/100/44.44, Tobias+Harper 4/44.44/50/61.11, Devon+Finley 4/44.44/50/61.11, Bailey+Gray 2/48.15/0/66.67. Also verified live over HTTP: a fresh pod shows all entrants at zero, standings update correctly as results come in (and correctly exclude a match's contribution until its result is actually submitted, even mid-round), and cross-org access to another org's standings 404s.

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
- [x] `README.md`: written early (2026-08-23, before Step 11) since the repo is now pushed and visible — covers what it is, current status, quick start, dev setup. Still needs: screenshots once there's real UI, and a final pass once the feature set settles
- [ ] `LICENSE` — MIT by default; ask Tobias if AGPL is preferred before first push (guards against closed-source SaaS forks)
- [ ] Final `.env.example` pass — everything needed to run listed, nothing missing

## Step 12 — Deploy to DaxLite
- [ ] Hand Tobias the exact compose file for `/opt/docker/arcane-projects/limited-gauntlet/compose.yaml` + steps — **he runs this**, not Claude (touches live infra)
- [ ] Once live: add a `services/daxlite.md` entry in `claude-memory`
