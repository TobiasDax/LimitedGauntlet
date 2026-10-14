# Roadmap

**Read this first in a new session.** It's the short list of what's shipped and what's still open. Design rationale lives in [`PLAN.md`](PLAN.md); the full detailed history of how everything was built and verified is archived in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md) — you rarely need to read that unless you're touching a specific past feature. [Ideas (unlikely to be built)](#ideas-unlikely-to-be-built) at the bottom holds things that came up but aren't active backlog — don't pick those up without checking with Tobias first.

## Status

The app is **feature-complete and running in production** — latest release **v0.19.1**, public demo at [limited-gauntlet.com](https://limited-gauntlet.com). The full numbered build (Steps 0–12) and the bulk of the PI-1…PI-112 backlog are shipped and browser-verified; all of that detail is archived in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md). The roadmap below is only what's still open.

**v0.19.1:** the display font is now self-hosted. Headlines, player names and other `font-display` text use Cinzel Decorative (regular and bold, SIL OFL 1.1) instead of a Georgia-only system stack, which fell back to a generic serif on Linux. Georgia remains as the fallback. No functional changes.

**v0.19.0:** visual restyle, no functional changes. Text glyphs, emoji and hand-drawn SVGs are replaced by Lucide icons; the color palette is consolidated from 28 to 17 values (contrast checked with WCAG math, link hover lightened to 4.5:1); image-overlay colors are `overlay` / `on-overlay` tokens; Varela Round is self-hosted as the body font (no requests to Google); and 24 ad-hoc pixel font sizes are folded into a 10-step rem type scale. Emails, API token names and webhook labels now use the sans font instead of the display serif.

**v0.18.3:** dependency maintenance, no functional changes. In-range updates across the server, client and MCP workspaces (fastify 5.12.5, nodemailer 10.0.15, fast-uri, ip-address, brace-expansion and others), which clear the open Dependabot security advisories, plus the dev tooling (eslint, typescript-eslint, prettier). Major bumps (stripe 23, dotenv 18, @types/node 26, Prisma 8) are deliberately held back; the one remaining advisory (mysql2) comes from Prisma's own dev tooling.

**v0.18.2:** hosted-instance polish for the first paying customers; no effect on self-hosted deployments. A Settings banner now tells an organization with an unused tournament pass to create a tournament with it, and the Tournaments page offers "Create free tournament" and "Buy Tournament / Series pass" (which becomes "Create paid tournament" once a pass is banked — a paid tournament keeps the free slot available). Series subscribers are now pointed to the Link web app (app.link.com) with sign-in instructions, and the hosted instance publishes Terms of Service and a refund/cancellation policy at `/terms` (HI-11; hosted-only, linked from the footer and the purchase note).

**v0.18.1:** two hosted-instance UI fixes. Creating a second organization on a free account now explains that the free organization is in use and points to upgrading it (Settings → Plan & billing), instead of a generic error; and organizations with a complimentary/perpetual Series plan (grandfathered or operator-granted) no longer see the subscription-management text and link meant for paying subscribers. No effect on self-hosted deployments.

**v0.18.0:** the hosted-instance entitlement layer (HI-1…HI-10, specified in [`ROADMAP-HOSTED.md`](ROADMAP-HOSTED.md)) — an optional, deployment-gated layer that only the hosted `app.limited-gauntlet.com` instance switches on, via `HOSTED_ENTITLEMENTS=true`. **Self-hosted deployments are unchanged**: the flag is unset by default, never set by the shipped Compose files or `.env.example`, and every check short-circuits on it before reading any tier, so a self-hosted install is still the complete, unrestricted app. When on: Free / Tournament-pass / Series tiers with per-tournament coverage, quota and date-window enforcement (pod limit, locked dates, play-window hard close, retention), capability gating, and a global upsell for 402 responses; one free org per account with registration decoupled from org creation; Stripe Managed Payments checkout and webhook adapter (idempotent per event/invoice) plus a subscription reconciliation backstop; and an operator CLI (`admin-entitlements`, `reconcile-subscriptions`) including a grandfather command. One additive migration (`hosted_entitlements`: nullable/defaulted columns and a `BillingEvent` table, inert unless enabled). Sandbox-verified end to end against Stripe test mode; browser-verified in both modes.

**v0.17.0:** PI-143 — an automatic pre-deploy database backup. A one-shot `db-backup` Compose service dumps the database (compressed `pg_dump`, to a bind-mounted `./backups`, 20 retained) before the app container starts and therefore before `prisma migrate deploy` runs. It fires once per `docker compose up`, is fail-closed (a failed dump blocks startup, so nothing migrates without a fresh backup), and is on by default in both compose files. Compose-only — the app image is unchanged from v0.16.6. Now browser-verified and closed out in the build log.

**v0.16.6:** organizer-only internal notes on a tournament, and the public-response hardening it needed first. PI-141 — the public routes spread raw Prisma rows, so every column on `Tournament`/`Pod` was published by default and any new one would go public the moment its migration ran; replaced with explicit field allowlists (`services/publicVisibility.ts`), tests pinning the exact key set. PI-140 — a private free-text field per tournament, the counterpart to the public description, sharing one tabbed Markdown editor with it; excluded from every public surface by construction thanks to PI-141, and from the player self-service export, but included in the org export and in scope of an Art. 15 request (`docs/gdpr.md`). PI-142 — both fields autosave (on blur + a slow debounce) with no Save button, an in-place cache update to stay clear of the rate limit, retry-on-failure, and a one-level Revert. All three browser-verified and closed out in the build log.

**v0.16.5:** a pairing-correctness fix found in a real 42-entrant event. PI-138 — pods above the exact-solver's size limit pair via a greedy fallback that never backtracks, so the last two entrants left could be a pair who had already met, and it emitted that repeat silently; within-pod repeats are a documented hard rule. Greedy now repairs a forced repeat by exchanging partners with another pair, and raises `PairingError` if it genuinely cannot, exactly as the exact solver already did. PI-139 — manual pairing and swap never checked within-pod history at all; both now warn (never block) when they create a rematch. **Browser-verify pending.**

**v0.16.4:** two bug fixes reported by Tobias from a real pod. PI-136 — the seating chart identified who had round 1's bye (a labelled, differently-styled seat) on the page projected for the room, before pairings were revealed. PI-137 — a pod whose round 1 was generated for seatings but never started counted as *played*, so its auto-scored bye handed the entrant a Hall of Fame crown, a win in player stats, Gesamtwertung points, and a row in the player data export. Both code-complete with regression tests confirmed failing against the previous behaviour first — **browser-verify pending**.

**v0.16.0:** all eleven findings (PI-123–133) from the 2026-09-17 external security/functional audit. Security: PI-123 (a malformed Socket.IO join acknowledgment could crash the whole server process), PI-124 (SSO could consume a pending co-organizer invite against an unverified email), PI-125 (an attacker preregistering an account with a victim's email could hijack their first SSO login), PI-126 (on-demand withdrawal snapshots leaked a player's real name in public responses and survived anonymization), PI-127 (a public-lock unlock grant outlived password rotation/disable), and PI-128 (a password change didn't revoke other active organizer sessions). Functional: PI-129 (compressed IPv6 addresses truncated to the wrong analytics prefix), PI-130 (a CUSTOM pod's name-only rename could be wrongly rejected), PI-131 (a logged-in player could see the public password prompt for content the server already permitted them), PI-132 (realtime updates stayed dead after a public-lock change forced a reconnect), and PI-133 (a foil-only card-pull edit could silently swap to a different printing). All code-complete, typechecked, and covered by real-DB service-layer tests where this codebase's testing convention allows (route-level HTTP/realtime/client behavior is code-reviewed only, per that same convention). All eleven items are now browser-verified and closed out in the build log.

**v0.15.3:** PI-119 (bug fix — long entrant names overflowed a seat box's border instead of wrapping), PI-120 (player portal: list the player's own pods with a self-service leave, and link tournaments to their public page), PI-121 (always-visible entrant headcount, and capacity if set, on a pod's Entrants tab), and PI-122 (bug fix — adding entrants stayed enabled after round 1 was paired; Remove and Drop are now mutually exclusive by pod state, both client- and server-enforced). PI-119, PI-121, and PI-122 are now browser-verified and closed out in the build log; PI-120 is still code-complete, browser-verify pending.

**v0.15.2:** two bug fixes reported by Tobias, both now live-verified and closed out in the build log. PI-117 — inviting a co-organizer whose email already had an account in a *different* org was wrongly refused; now creates the invite normally and lets the existing PI-86 "log in to accept" flow handle it. PI-118 — a pod's public standings leaked who has round 1's bye before pairings were revealed (a bye is auto-scored the instant round 1 is generated); standings now hide on the same condition as pairings and reveal together.

**v0.15.1:** PI-116 (running app version shown in the footer, linked to its GitHub release page). Now browser-verified and closed out in the build log.

**v0.15.0:** PI-92 (CI now builds the Docker image and runs a boot smoke test on every PR, closing the last gap in project-health coverage — full write-up in the build log). PI-113 (webhook SSRF hardening) and PI-39 (legacy-data.json import via the Settings UI) shipped their code here and are now fully deployed/browser-verified — closed out in the build log.

**v0.14.0:** PI-115 (split a large draft/chaos-draft pod into multiple physical tables — shape picker, pair-preserving table fill, per-table seating on both the organizer and public pages; browser/data-verified against a real 20-entrant pod, including a seat-numbering bug caught and fixed via that testing).

**v0.14.1:** a column-mode alignment bug in PI-114's responsive seating chart, caught on a real phone right after v0.14.0 shipped — column mode's empty-slot spacer for an odd entrant count wasn't taking up any vertical space, misaligning the two columns. PI-114 is now fully browser-verified and closed out in the build log.

**Live instance (DaxLite, `limited-gauntlet-live`):** running **v0.15.3** as of 2026-09-16, deploy confirmed working. Recently shipped **and** browser-verified, now in the build log: PI-75 (operator signup webhook), PI-76–84 (the pod-list cluster — reorder, finished-pods sink, Scheduled/On-demand tabs, timestamps, date dividers, pod cancel), PI-85 (deployer analytics), PI-86 (one login across multiple orgs), PI-87 (Settings/Profile split), PI-88–92 / 93 / 94 / 98 (project-health: CI on Forgejo, ESLint + Prettier, tag-triggered GHCR release, container hardening, the `@fastify/compress` hotfix, CI's PR-time image build + boot smoke test), PI-96/97 (player detail page, per-pod entrant count), PI-99/100 (pod participation fix + on-demand side events), PI-103–108 / 110 (the GDPR/DSGVO pass + privacy round 2, v0.10.0–v0.11.0), PI-112 (built-in `/legal` page, v0.12.0), PI-102 / PI-109 / PI-111 (boot-time dep guard, Prisma 7, ESLint 10 — v0.13.0), PI-115 (multi-table draft splits, v0.14.0/v0.14.1), PI-114 (responsive seating chart, v0.14.0/v0.14.1), PI-39 (legacy-data.json import UI, v0.15.0), PI-113 (webhook SSRF hardening, v0.15.0), PI-116 (footer version link, v0.15.1), PI-117 (cross-org co-organizer invite fix, v0.15.2), PI-118 (standings-reveal leak fix, v0.15.2), PI-119 (seating chart name overflow fix, v0.15.3), PI-121 (Entrants tab headcount, v0.15.3), PI-122 (add/remove/drop pairing-state bug fixes, v0.15.3).

**Dependency majors batch** (`deps/majors-2026-09`, PR #1, **shipped in v0.10.0**): argon2, nodemailer 10, Vite 8 / Vitest 5, zod 4, openid-client 6, TypeScript 7-native builds. Prisma 6→7 was split off as **PI-109** and the ESLint-stack majors as **PI-111** — both shipped in **v0.13.0** and deployed to the live instance 2026-09-10 (`migrate deploy` a no-op — schema unchanged). PI-101 (the security pass — `npm audit` was 0; now 2 dev-only advisories from the Prisma 7 CLI, see PI-109's build-log entry) closed 2026-09-10; full tranche notes are in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md).

## Open items

Only genuinely-open work lives here. Everything shipped **and** browser-verified is in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md).

- **PI-134** — Gesamtwertung pip legend ordering (date/time, on-demand last). Fixed 2026-09-18, browser-verify pending.
- **PI-135** — public Gesamtwertung: link player names and pod pips. Fixed 2026-09-18, browser-verify pending.
- **PI-136** — seating chart revealed round 1's bye early. Fixed 2026-09-26, browser-verify pending.
- **PI-137** — unstarted pods counted as played (phantom Hall of Fame crown). Fixed 2026-09-26, browser-verify pending.
- **PI-138** — greedy pairing emitted a silent repeat opponent. Fixed 2026-09-26, browser-verify pending.
- **PI-139** — manual pairing/swap created rematches silently. Fixed 2026-09-26, browser-verify pending.
- **PI-120** — player portal: list the player's own pods (with self-service leave) and link tournaments to their public page. Code shipped in v0.15.3, browser-verify pending.

## New improvements (backlog)

_New feature requests go here. Keep each one self-contained enough to pick up cold in a future session, then move it to `docs/BUILD-LOG.md` once it's shipped **and** browser-verified._

> **Verification note:** the dev sandbox can't run the app (no Docker) or a full `vite build`, so items are built and typechecked (`tsc -b`) there, then browser-verified separately by Tobias on a real running instance. A bare ✅ means shipped and browser-verified; "code-complete, browser-verify pending" means the code is in but not yet checked on a live deploy.

### PI-138 — Greedy pairing emitted a silent repeat opponent ⏳ (fixed 2026-09-26, browser-verify pending)
Reported by Tobias (2026-09-26) from the live `app.` instance: a 42-entrant SEALED pod re-paired two players in round 6 who had already met in round 3. Confirmed against the real data — at that moment every player still had 26–29 legal partners out of 31, and a repeat-free perfect matching demonstrably existed, so nothing about the round forced it.

A pod over `EXACT_MATCHING_POOL_LIMIT` (18) skips the backtracking exact solver entirely, so greedy paired every round of that pod. Greedy skips illegal partners while scanning, so the hard-avoid holds until the very end — then the final entrant has exactly one candidate left, and if they had met, `findIndex` returned -1 and the code fell through to index 0, pairing the repeat anyway. The prior comment defended this as "only when a player has already faced everyone left below them", which was wrong: it is greedy's own earlier choices, with no backtracking to undo them.

- [x] A forced repeat is now repaired by exchanging partners with another pair. Both recombinations are checked in full before either is applied, so a repair can never trade one repeat for another.
- [x] If no repair exists, `solveGreedy` returns null and the caller raises `PairingError` — the same "use manual pairing to resolve this round" path the exact solver's null already took. A hard rule no longer degrades to a soft one silently.
- [x] **Test** (`pairing.test.ts`): a soak rather than a fixture, deliberately — pool order comes from an unordered `findMany`, so which two entrants end up last cannot be pinned down, and two hand-built collisions passed against the broken code before this was understood. Nine rounds of a 22-entrant pod measured 5/5 pods repeating without the repair and 0/5 with it; the test fails at round 6, same as production. Server suite 245/245.
- [ ] **Not browser-verified**: Tobias should run a large pod (20+) through several rounds on a live instance and confirm no rematch appears. The existing Reality Fracture pod is unaffected — this changes future pairings only; its round 6 rematch is still recorded and can be corrected with a swap.

### PI-139 — Manual pairing and swap created rematches silently ⏳ (fixed 2026-09-26, browser-verify pending)
Found while investigating PI-138: neither `POST /pods/:id/rounds/manual` nor `POST /rounds/:id/swap` consulted within-pod history, so an organizer could recreate by hand exactly the repeat the engine treats as a hard rule, with nothing said.

- [x] New shared `findRepeatPairings(podId, roundNumber, pairs)` (`services/pairing.ts`); both routes return the offending pairs as `repeatWarnings`.
- [x] `PairingsPage` shows a warning banner after a swap, naming who already played, and noting the swap was applied.
- [x] Deliberately a warning, not a block: an organizer overriding the engine is legitimate, and a round may genuinely have no repeat-free arrangement left. The goal is only that an accidental rematch doesn't reach the table unnoticed.
- [ ] **Not browser-verified**: Tobias should confirm the banner appears on a swap that recreates a prior pairing, and stays absent otherwise.

### PI-136 — Seating chart revealed round 1's bye ⏳ (fixed 2026-09-26, browser-verify pending)
Reported by Tobias (2026-09-26) from a real 39-entrant pod. The seat holding the bye rendered with a dashed border, a sunken background and a "Round 1 bye" label — on `SeatingsPage` (the page an organizer projects while the room finds its seats) and on `PublicPodPage`. A bye is auto-scored the instant round 1 is generated, so this announced who was sitting out before pairings were revealed: the same early-leak class as PI-118, one surface further on.

- [x] `SeatingChart`'s `showByeBadge` now defaults to **false** instead of true, so a caller that forgets the prop stays silent rather than leaking.
- [x] Both unsplit callers pass `showByeBadge={!!round1.pairingsRevealedAt}` — the same condition the pairings and standings already use, so all three reveal together. Split-table charts were already passing false (PI-115) and are unchanged.
- [x] No layout tell: the empty chair in an odd pod sits adjacent to seat 1 by design, not beside the bye seat. The only residual is that someone who knows the MTG convention could work out the bye lands on seat `ceil(N/2)` — inherent to publishing a convention-based seating chart.
- [ ] **Not browser-verified**: Tobias should confirm on an odd-sized pod that the bye seat is visually identical to every other seat before reveal, and that the badge returns once round 1's pairings are revealed.

### PI-137 — Unstarted pods counted as played ⏳ (fixed 2026-09-26, browser-verify pending)
Reported by Tobias (2026-09-26), same pod as PI-136: the Hall of Fame showed a win and a champion's crown for the bye entrant of a pod nobody had played.

`podIsPlayed` (`services/standings.ts`) tested `rounds.length > 0`, on the documented assumption that "you can't pair a pod without starting it". Seatings (PI-79/80) broke that assumption — round 1 is generated purely so players can find their seats, long before anyone plays — and because a bye is auto-scored the moment round 1 exists, the unstarted pod credited its bye entrant a win across every consumer: Hall of Fame (crown + `podsPlayed`), player stats, Gesamtwertung, and the player data export.

- [x] Split into two honest predicates rather than bending one. `podIsPlayed` now requires a round to have actually left `PENDING`, or the pod to be `COMPLETED` (which keeps points-only legacy imports with no Round rows counting). `podHasPairings` keeps the old meaning under an accurate name for `onDemandWithdrawal.ts`, which asks a genuinely different question — "are pairings already laid out, so removing someone would invalidate them?" — where a generated-but-unstarted round should still answer yes.
- [x] Fixed the same rule encoded as a Prisma filter in `playerStats.ts` (`rounds: { some: {} }`), which the typechecker could not reach and which would otherwise have kept miscounting "pods played" after the predicate was fixed.
- [x] **Tests** (`hallOfFame.test.ts`, `gesamtwertung.test.ts`): an odd pod with round 1 generated in `PENDING` and an auto-scored bye yields no crown and no pods-played for anyone; participant counting ignores a `PENDING`-round pod. Both confirmed failing against the previous behaviour first (the Hall of Fame one reproduced the exact phantom crown; the participant count returned 5 instead of 3). Full server suite: 244/244.
- [ ] **Not browser-verified**: Tobias should confirm the Hall of Fame and player stats for the affected pod no longer show the phantom win/crown, and that they appear as normal once the pod is actually under way.

### PI-134 — Gesamtwertung pip legend: order by date/time, on-demand pods last ⏳ (fixed 2026-09-18, browser-verify pending)
Reported by Tobias (2026-09-18), from the public tournament page's "Pips, left to right" legend under the Gesamtwertung table (`GesamtwertungList.tsx`).

**Missing pods (not a bug, now called out in the UI):** `computeGesamtwertung` only includes pods where `podIsPlayed` is true (`rounds.length > 0 || status === "COMPLETED"`) — per PI-99, a pod still in SETUP hasn't been played by anyone yet, so it contributes no points and gets no column. It'll appear automatically once its first round is generated. `GesamtwertungList.tsx`'s pip legend now adds a one-line disclaimer under the pip list itself ("Only pods that have started appear here — a pod still in setup gets a column once its first round begins.") so this isn't only discoverable by asking.

**Ordering — fixed:** pods were listed in raw `sequenceOrder`, which diverges from the calendar schedule once a tournament is manually reordered and pods get added afterward at whatever sequence position (e.g. a pod dated Sept 26 landing after Sept 27 pods because it was created later). Decided with Tobias: order scheduled pods by date then start time (matching the "Scheduled" tab's own sort), with on-demand pods trailing at the end ordered by their actual start time (`actualStartedAt`) rather than a planned date they don't have.

- [x] New `sortForGesamtwertung()` (`server/src/services/gesamtwertung.ts`): scheduled pods sorted by `date`/`startTime` (undated-scheduled falls back to `sequenceOrder`), on-demand pods sorted by `actualStartedAt` (falls back to `sequenceOrder` if somehow unset) and appended after every scheduled pod. Applied to `computeGesamtwertung`'s `playedPods` right after the SETUP filter, so both the point-accumulation loop and the returned `pods` column order use it — no client changes needed, `GesamtwertungList.tsx` just renders `pods` in whatever order the server returns.
- [x] **Tests** (`gesamtwertung.test.ts`, pure unit tests on `sortForGesamtwertung`, no DB): date/time ordering overrides `sequenceOrder`; same-date pods break ties by start time; undated-scheduled pods fall back to `sequenceOrder`; every on-demand pod sorts after every scheduled pod regardless of dates; on-demand-among-on-demand orders by `actualStartedAt`; an on-demand pod with no `actualStartedAt` falls back to `sequenceOrder`. Full server suite: 243/243 passing.
- [ ] **Not yet browser-verified**: Tobias should confirm the live pip legend now reads in schedule order with on-demand pods trailing, using this exact tournament (`neuburger-magic-testliga` / `cmtt48rkk000muf015zsn5uan`) as the real-data check.

### PI-135 — Public Gesamtwertung: link player names to their public player page ⏳ (fixed 2026-09-18, browser-verify pending)
Idea from Tobias (2026-09-18): on the Gesamtwertung standings table (`GesamtwertungList.tsx`, shared by the organizer's `GesamtwertungPage.tsx` and the public `PublicTournamentPage.tsx`), player names rendered as a plain `<span>` — not clickable, unlike `HallOfFamePage`/`PublicHallOfFamePage`/`PublicPodPage`, which already link entrant/player names via a `playerLinkTo={(id) => ...}` prop to `PlayerStatsPage`/`PublicPlayerStatsPage`.

- [x] `GesamtwertungList` now takes a required `playerLinkTo: (playerId: string) => string` prop and renders `row.player.displayName` as a `<Link>` (`hover:text-accent-strong`, `truncate` retained) instead of a `<span>`. `GesamtwertungPage.tsx` (organizer) passes `/hall-of-fame/players/${id}`; `PublicTournamentPage.tsx` passes `/o/${slug}/hall-of-fame/players/${id}` — the exact same two URL patterns `HallOfFamePage.tsx`/`PublicHallOfFamePage.tsx` already use for the same route. No other callers of `GesamtwertungList` exist.
- [x] **Follow-up (2026-09-18, same session):** the per-pod point pips (the small badges in each player's row, not just the legend text) are now also a `<Link>` to that pod's page, keeping the existing `title={pod.name}` hover tooltip and adding `hover:border-accent hover:text-ink` for a visible affordance. New `podLinkTo: (podId: string) => string` prop, mirroring `playerLinkTo`; `GesamtwertungPage.tsx` passes `/pods/${podId}`, `PublicTournamentPage.tsx` passes `/o/${slug}/tournaments/${id}/pods/${podId}` (identical pattern to `PodList`'s own `podHref` on the same page).
- [ ] **Not tested** — no client test infrastructure exists in this repo (consistent with every other client-only change). Verified by `tsc --noEmit`, `eslint`, and `prettier --check`, all clean. **Not yet browser-verified**: Tobias should confirm a click on a name lands on that player's profile, and a click on a pip lands on that pod's page, in both the organizer's and the public Gesamtwertung table.

### PI-120 — Player portal: list the player's own pods, and link tournaments to their public page ⏳ (shipped in v0.15.3, browser-verify pending)
Idea from Tobias (2026-09-15), from the player portal at `/o/<slug>/player`:
- A list of every pod the player is currently signed up for (an `Entrant` row exists for them, directly or via a team), so they can jump straight to that pod's page instead of hunting for it, and — new capability — leave a pod if needed.
- Clicking a tournament in the portal's "Tournaments" section should open that tournament's page and show all its pods, the same view the public link already gives (`/o/<slug>/tournaments/:id`, `PublicTournamentPage.tsx`).

**Built:**
- [x] **Tournament links.** `PlayerPortalPage.tsx`'s tournament cards now link their name to `/o/<slug>/tournaments/:id` — the existing public page, no new backend work.
- [x] **"Your pods" list.** `GET /api/player/portal`'s existing `myEntrants` query (`server/src/routes/playerAccounts.ts`) now also selects each entrant's pod (id/name/tournament id+name/round count) and `droppedAfterRound`, returned as a new `pods` array. A new "Your pods" section (`MyPodCard`) renders one card per pod, linking to its public page.
- [x] **Self-service leave, per the decided design (drop post-start, remove pre-start).** New `leavePod()` (`services/playerAccounts.ts`) mirrors the organizer-only `DELETE /api/entrants/:id` / `POST /api/entrants/:id/drop` semantics exactly: no rounds yet → hard-deletes the `Entrant` (or the whole `Team`, cascading); round 1+ exists → sets `droppedAfterRound` to the latest round, guarded against `round_in_progress` (only between rounds, same as the organizer path) and `already_dropped`. Wired through a new `DELETE /api/player/pods/:id/entrant` route. The client's confirm dialog previews which outcome to expect (`pod.started`) before the request, and hides the "Leave" button (shows "Dropped" instead) once `pod.dropped` is true.
- [x] **Tests:** `leavePod` covered in `playerAccounts.test.ts` (real DB) — pre-start removal (individual + whole-team), post-start drop, `round_in_progress`, `already_dropped`, and a non-entrant rejection. `tsc -b`/`eslint`/`prettier` clean on both workspaces.
- [ ] **Not yet browser-verified** — sandbox has no DB/browser. Tobias should confirm: a pod before round 1 shows "Leave" and fully removes on confirm; a pod between rounds shows "Leave" and drops (entrant stays visible elsewhere as dropped); a pod mid-round surfaces the `round_in_progress` error; tournament links land on the right public page.
- **Known limitation, not addressed:** a team pod's player leaving/dropping takes the *whole team* with them, same as the organizer path today — no per-member leave. Flagged during scoping as undecided; shipped as-is since it matches existing organizer behavior exactly rather than inventing new semantics.

## Project-health backlog (from the 2026-09-06 code audit)

Not feature work — these harden the project itself. Nothing genuinely open remains here at the moment; the CI / lint / release / hardening / performance keystones (PI-88–92, 93–95, 98) are all shipped and in the build log.

## V2 ideas (to be scoped)

Features Tobias intends to build eventually but hasn't scoped yet. Don't start one without his go-ahead; he'll supply the screen design and feature list first.

### PI-144 — Life counter (idea, noted 2026-10-07)
Players can use the app as a life counter to track life points during their games.

- **Secondary function.** Most likely not linked to match results.
- **State must survive interruptions.** Turning the phone off or taking a call must not lose the values, so the counter state has to be saved (client-side and/or server-side, to be decided at scoping).
- **No history.** There is no need to keep historic life-total data in the database; only the current state matters.
- **Not yet specified.** Tobias will provide a screen design and a clear feature/function set once the build is decided. This entry exists only so the idea isn't forgotten.

### PI-145 — Light mode (idea, noted 2026-10-08)
A light color theme alongside the current dark one. The app is dark-only today; `client/src/index.css` has carried "dark mode only for v1 (light mode is a deliberate v2)" since the design system was set up.

- **Not yet scoped.** Open questions for scoping: follow the OS setting (`prefers-color-scheme`) vs. a manual toggle (and where it's stored), and whether the public pages get their own choice.
- **Groundwork exists.** Colors already go through the `@theme` tokens in `index.css`, so a light palette is mostly a second set of values for those tokens.
- **Remaining hardcoded colors.** The palette consolidation (2026-10-08) tokenized the accent-fill text, button hover, rank badges and body glow; the image-overlay classes now use `overlay` / `on-overlay` tokens too. The only literal color left is the white QR-code tile in `SharePopup.tsx`, which must stay white to be scannable.
- **Contrast must be re-verified.** The current palette was checked against WCAG 4.5:1 (PI-10); a light palette needs the same math, not eyeballing, for ink, accent and link colors on every surface.

## Ideas (unlikely to be built)

Things that came up as a possible feature but that Tobias doesn't expect to actually build — kept here for the scoping/context in case priorities ever change, not active backlog. Don't pick one of these up without checking with him first.

### PI-62 — Deck photos (parked 2026-09-14)
Idea from Tobias (2026-08-31): on a pod's standings page, let each entrant have a photo of their drafted deck attached. Scoped via a full interview before any code — see `docs/BUILD-LOG.md` git history / this file's own prior revisions for the complete scoping notes if it's ever revisited. Short version of what was decided:

- **The app's first-ever user-uploaded file** — every prior "image" in the app (Scryfall card art) is a hotlinked external URL; `PLAN.md`/`CLAUDE.md` explicitly rule out file uploads elsewhere (PI-31) as a deliberate scope boundary this would cross.
- Organizer-upload v1, player self-upload later (on top of PI-52's player auth); local-disk storage (a new bind-mounted volume, no S3); validate + re-encode through `sharp` (a new dependency) to reject non-images and strip embedded metadata/polyglot payloads; a generated preview shown by default, original available via explicit zoom/download actions; public visibility matching the rest of standings but hidden-by-default behind a modal.
- Real open questions flagged at scoping time and never resolved: new file-serving routes respecting the PI-27 password lock, filesystem cleanup on delete (the app's first delete path with a non-DB side effect), and a second thing (the photo volume) for self-hosters to back up.

Parked because it's "more involved" than the rest of the backlog for a feature Tobias isn't confident anyone would actually use — not rejected for a technical reason, just deprioritized indefinitely.
