# Roadmap

**Read this first in a new session.** It's the short list of what's shipped and what's still open. Design rationale lives in [`PLAN.md`](PLAN.md); the full detailed history of how everything was built and verified is archived in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md) — you rarely need to read that unless you're touching a specific past feature. [Ideas (unlikely to be built)](#ideas-unlikely-to-be-built) at the bottom holds things that came up but aren't active backlog — don't pick those up without checking with Tobias first.

## Status

The app is **feature-complete and running in production** — latest release **v0.15.3**, public demo at [limited-gauntlet.com](https://limited-gauntlet.com). The full numbered build (Steps 0–12) and the bulk of the PI-1…PI-112 backlog are shipped and browser-verified; all of that detail is archived in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md). The roadmap below is only what's still open.

**v0.15.3:** PI-119 (bug fix — long entrant names overflowed a seat box's border instead of wrapping), PI-120 (player portal: list the player's own pods with a self-service leave, and link tournaments to their public page), PI-121 (always-visible entrant headcount, and capacity if set, on a pod's Entrants tab), and PI-122 (bug fix — adding entrants stayed enabled after round 1 was paired; Remove and Drop are now mutually exclusive by pod state, both client- and server-enforced). All code-complete, browser/live-verify pending.

**v0.15.2:** two bug fixes reported by Tobias. PI-117 — inviting a co-organizer whose email already had an account in a *different* org was wrongly refused; now creates the invite normally and lets the existing PI-86 "log in to accept" flow handle it. PI-118 — a pod's public standings leaked who has round 1's bye before pairings were revealed (a bye is auto-scored the instant round 1 is generated); standings now hide on the same condition as pairings and reveal together. Both code-complete, live-verify pending.

**v0.15.1:** PI-116 (running app version shown in the footer, linked to its GitHub release page — shipped, browser-verify pending).

**v0.15.0:** PI-92 (CI now builds the Docker image and runs a boot smoke test on every PR, closing the last gap in project-health coverage — full write-up in the build log). PI-113 (webhook SSRF hardening) and PI-39 (legacy-data.json import via the Settings UI) shipped their code here and are now fully deployed/browser-verified — closed out in the build log.

**v0.14.0:** PI-115 (split a large draft/chaos-draft pod into multiple physical tables — shape picker, pair-preserving table fill, per-table seating on both the organizer and public pages; browser/data-verified against a real 20-entrant pod, including a seat-numbering bug caught and fixed via that testing).

**v0.14.1:** a column-mode alignment bug in PI-114's responsive seating chart, caught on a real phone right after v0.14.0 shipped — column mode's empty-slot spacer for an odd entrant count wasn't taking up any vertical space, misaligning the two columns. PI-114 is now fully browser-verified and closed out in the build log.

**Live instance (DaxLite, `limited-gauntlet-live`):** running **v0.15.0** as of 2026-09-15, deploy confirmed working. Recently shipped **and** browser-verified, now in the build log: PI-75 (operator signup webhook), PI-76–84 (the pod-list cluster — reorder, finished-pods sink, Scheduled/On-demand tabs, timestamps, date dividers, pod cancel), PI-85 (deployer analytics), PI-86 (one login across multiple orgs), PI-87 (Settings/Profile split), PI-88–92 / 93 / 94 / 98 (project-health: CI on Forgejo, ESLint + Prettier, tag-triggered GHCR release, container hardening, the `@fastify/compress` hotfix, CI's PR-time image build + boot smoke test), PI-96/97 (player detail page, per-pod entrant count), PI-99/100 (pod participation fix + on-demand side events), PI-103–108 / 110 (the GDPR/DSGVO pass + privacy round 2, v0.10.0–v0.11.0), PI-112 (built-in `/legal` page, v0.12.0), PI-102 / PI-109 / PI-111 (boot-time dep guard, Prisma 7, ESLint 10 — v0.13.0), PI-115 (multi-table draft splits, v0.14.0/v0.14.1), PI-114 (responsive seating chart, v0.14.0/v0.14.1), PI-39 (legacy-data.json import UI, v0.15.0), PI-113 (webhook SSRF hardening, v0.15.0).

**Dependency majors batch** (`deps/majors-2026-09`, PR #1, **shipped in v0.10.0**): argon2, nodemailer 10, Vite 8 / Vitest 5, zod 4, openid-client 6, TypeScript 7-native builds. Prisma 6→7 was split off as **PI-109** and the ESLint-stack majors as **PI-111** — both shipped in **v0.13.0** and deployed to the live instance 2026-09-10 (`migrate deploy` a no-op — schema unchanged). PI-101 (the security pass — `npm audit` was 0; now 2 dev-only advisories from the Prisma 7 CLI, see PI-109's build-log entry) closed 2026-09-10; full tranche notes are in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md).

## Open items

Only genuinely-open work lives here. Everything shipped **and** browser-verified is in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md).

- **PI-116** — show the running app version in the footer, linked to its GitHub release page: shipped in v0.15.1, browser-verify pending.
- **PI-117** — bug fix: inviting a co-organizer whose email already has an account (in a *different* org) wrongly refused with "That email already has an account." Code shipped in v0.15.2, live-verify pending.
- **PI-118** — bug fix: a pod's public standings leaked who has round 1's bye before pairings are revealed (the bye is auto-scored the instant round 1 is generated). Code shipped in v0.15.2, live-verify pending; a related, lower-severity variant in the weekend Gesamtwertung table and player Hall of Fame pages is a known, deliberately-deferred gap (see its write-up) — confirmed with Tobias not worth fixing now.
- **PI-119** — bug fix: long entrant names overflowed a `SeatingChart` seat box's border instead of wrapping, spilling into neighboring seats. Code shipped in v0.15.3, browser-verify pending.
- **PI-120** — player portal: list the player's own pods (with self-service leave) and link tournaments to their public page. Code shipped in v0.15.3, browser-verify pending.
- **PI-121** — show an always-visible entrant headcount (and capacity if set) on a pod's Entrants tab. Code shipped in v0.15.3, browser-verify pending.
- **PI-122** — bug fix: adding entrants stayed enabled after round 1 was paired; now blocked (client + server) until the pairing is undone, and Remove/Drop are mutually exclusive by pod state. Code shipped in v0.15.3, browser-verify pending.

## New improvements (backlog)

_New feature requests go here. Keep each one self-contained enough to pick up cold in a future session, then move it to `docs/BUILD-LOG.md` once it's shipped **and** browser-verified._

> **Verification note:** the dev sandbox can't run the app (no Docker) or a full `vite build`, so items are built and typechecked (`tsc -b`) there, then browser-verified separately by Tobias on a real running instance. A bare ✅ means shipped and browser-verified; "code-complete, browser-verify pending" means the code is in but not yet checked on a live deploy.

### PI-116 — Show the running app version in the footer, linked to its release notes ⏳ (shipped in v0.15.1, browser-verify pending)
Idea from Tobias (2026-09-15): put the running version number next to the GitHub link in `client/src/components/Footer.tsx`, linking to that version's GitHub release page (`https://github.com/TobiasDax/LimitedGauntlet/releases/tag/vX.Y.Z`) — easy access to the release notes for whatever's actually deployed, without needing to know the version to look it up.

- [x] **Version reaches the frontend.** `server/src/config.ts` reads `version` from the root `package.json` (the single shared version per PI-22) at startup, resolved relative to `config.ts`'s own file location so it works identically from `tsx` dev and the compiled `server/dist` runtime regardless of `process.cwd()` (same pattern `index.ts` already used for `clientDistPath`). Exposed as `appVersion` on the existing public `GET /api/app-config` endpoint (`server/src/routes/auth.ts`) — no new env var, and it can't drift from what's actually built into the image.
- [x] **Footer change:** `client/src/components/Footer.tsx` renders a `vX.Y.Z` link right after the GitHub link (same `linkClass` styling) pointing at `.../releases/tag/vX.Y.Z`, only when `appVersion` has loaded.
- [x] `tsc -b`/`eslint`/`prettier` clean on all three workspaces.
- [ ] **Not yet browser-verified** — this sandbox has no Docker/browser to click through the actual rendered footer. Tobias should confirm the version link appears and resolves to the correct release page on a real running instance.

### PI-117 — Bug fix: co-organizer invite wrongly refused for an email with an account in a different org ⏳ (shipped in v0.15.2, live-verify pending)
Reported by Tobias: inviting a co-organizer whose email already has an `OrganizerAccount` — just in some *other* org, not this one — refused with "That email already has an account," even though PI-86 already split accounts from org membership specifically so one person can belong to multiple orgs.

**Root cause:** `POST /api/settings/organizers/invite` (`server/src/routes/settings.ts`) checked only whether *any* `OrganizerAccount` existed for the email and 409'd unconditionally — it never checked whether that account was actually a member of *this* org. This meant the invite (and its `OrganizerInvite` row) was never even created for an existing account, so the accept-invite flow's already-built "you already have an account — log in to accept" path (`GET /api/auth/invite/:token`'s `accountExists` flag, and `AcceptInvitePage.tsx`'s corresponding branch) could never actually be reached in practice.

**Fixed:** the invite route now looks up the existing account (if any) and only refuses (`already_member`) when that account already has an `OrganizerMembership` in *this specific* org. Otherwise it creates the invite exactly as it would for a brand-new email — the invitee gets the same emailed link, and accept-invite already knows to skip the name/password form and just ask them to log in and click "Join", adding a membership without creating a second account. `OrganizersSection.tsx`'s error copy updated to match (`already_member` → "That person is already a member of this organization.").

Deliberately **not** implemented as "silently add them to the org and just notify by email" (closer to Tobias's initial phrasing) — requiring the invitee's own accept click preserves the same consent model every other invite already uses (nobody's org membership list changes without their own action), and reuses PI-86's already-built, previously-dead-code acceptance path instead of adding a new no-consent code path.

- [x] Root cause identified, fix implemented and typechecked/linted/formatted clean on both client and server.
- [ ] **Not yet live-verified** — no route-level tests exist for this file (matches this codebase's existing test convention: `routes/*.ts` files aren't directly unit-tested, only the service layer is) and the sandbox has no DB/browser. Tobias should confirm end-to-end: invite an email that already has an account in a different org, confirm the invite is created (not refused), confirm the invitee receives the email and the accept-invite page shows the "log in to accept" branch (not a signup form), and confirm accepting adds the membership without creating a duplicate account.

### PI-118 — Bug fix: a pod's public standings leak who has round 1's bye before pairings are revealed ⏳ (shipped in v0.15.2, live-verify pending)
Reported by Tobias: after seatings are confirmed but before round 1 is revealed/started, a player checking the pod's public standings can already see someone sitting at 3 (or however many `pointsWin` is configured) points — the bye recipient, since a bye needs no opponent to report a result against and is auto-scored the instant round 1's `Match` rows are created (`podStats.ts`'s `tallyMatches`, unconditional on `entrantBId === null`). Wanted: hide standings the same way PI-80 already hides pairings, revealed together.

**Fixed:** extracted the exact condition PI-80's `redactUnrevealedRound1` already used into a shared, exported `isRound1Unrevealed()` predicate (`server/src/services/pairingsVisibility.ts`), so "hidden" means the same thing everywhere. `GET /api/public/o/:slug/pods/:id/standings` now fetches round 1's `pairingsRevealedAt` first and returns `{ standings: [] }` without ever calling `computePodStandings` when it's unrevealed — same shape the client already handles for a SETUP pod with no entrants yet. `PublicPodPage.tsx` mirrors the per-round `hidden` flag it already computes for the Pairings section to pick the right empty-state copy ("Standings aren't revealed yet…") instead of the misleading "No entrants yet."

Deliberately scoped to the public **pod standings** route only (what was actually reported) — the organizer's own authenticated standings view is untouched (same reveal-blind-vs-reveal-aware split PI-80 already established between public and authenticated reads).

- [x] Shared predicate extracted + tested (`pairingsVisibility.test.ts`), public standings route fixed, client empty-state copy fixed. `tsc -b`/`eslint`/`prettier` clean on both workspaces.
- [ ] **Not yet live-verified** — same sandbox limitation as PI-117 (no DB/browser). Tobias should confirm: generate a pod with an odd entrant count (forcing a bye) through seating, check the public pod page shows no standings until "Reveal pairings," then confirm the bye's points appear immediately once revealed.
- [x] **Known, narrower related leak — deliberately deferred, confirmed with Tobias (2026-09-15).** The same bye-before-reveal points also flow into the weekend Gesamtwertung table (`computeGesamtwertung`, shared by the public Gesamtwertung route, the organizer's own view, and the spreadsheet export) and a player's individual Hall-of-Fame page (`computePlayerStats`, similarly shared). Fixing those would require threading a "hide unrevealed round 1" option through shared service functions that authenticated/export callers must keep bypassing — more invasive than this pass, and the practical exposure window is much narrower (aggregated weekend totals, or a specific player's own history page, rather than the one page every attendee actually watches). **Decision: not worth it for now** — the main standings page (what was actually reported) is enough.

### PI-119 — Bug fix: long entrant names overflow a seat box's border in `SeatingChart` ⏳ (shipped in v0.15.3, browser-verify pending)
Reported by Tobias (screenshot, a real 20+ entrant pod): a long name like "Matthias Werner-W…" or "Bernhard Frisch" rendered past its seat box's right border, overlapping the neighboring seat instead of staying inside its own box.

**Root cause:** the name `<span>` used Tailwind's `truncate` (single-line, `overflow: hidden` + ellipsis), but never had a `w-full` — and its parent cell is a `flex-col` container with `items-center`, which centers children at their own natural content width rather than stretching them to fill it. Without a defined width to clip against, the span just grew as wide as its full text needed and rendered past its own box's edge; `truncate`'s `overflow: hidden` had nothing to actually clip.

**Fixed:** `client/src/components/SeatingChart.tsx`'s name span now gets `w-full` (so it's genuinely constrained to the seat box's width, sidestepping the `items-center` sizing quirk) and swaps `truncate` for `break-words` (wraps onto a second line, including breaking a single long unbroken word, instead of single-line-and-clip) — matching what was actually asked for ("line breaks and never overflow") rather than an ellipsis cut. `leading-tight` keeps a two-line name from inflating the seat box too much. One shared component, so this fixes both the organizer's Seatings page and the public pod page's seating chart at once.

- [x] Fixed, `tsc -b`/`eslint`/`prettier` clean.
- [ ] **Not yet browser-verified** — this sandbox has no browser to visually confirm the wrap/no-overflow behavior on a real long name. Tobias should re-check the same pod that showed the bug.

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

### PI-121 — Show an entrant headcount (and capacity, if set) on the pod's Entrants tab ⏳ (shipped in v0.15.3, browser-verify pending)
Idea from Tobias (2026-09-16): on a pod's Entrants tab, show how many players/teams are currently added, and the max if one's set — so the organizer doesn't have to count rows or flip to the pod-list view to see it.

**Built:** a new always-visible `EntrantHeadcount` component (`PodPage.tsx`) renders above the entrants list in both `IndividualEntrants` and `TeamEntrants` — `"N players"`/`"N teams"` when no capacity is set, `"N / M players"`/`"N / M teams"` when it is (same "N / M" pattern `PodList.tsx`'s on-demand tab already uses). Sits alongside the existing `CapacityNote`, which still shows its own "at/over capacity, you can still add more" warning once relevant — the two aren't mutually exclusive.

- [x] Built, `tsc -b`/`eslint`/`prettier` clean.
- [ ] **Not yet browser-verified** — sandbox has no browser. Tobias should confirm the count shows correctly with and without a capacity set, on both individual and team pods.

### PI-122 — Bug fix: adding entrants stayed enabled after round 1 was paired ⏳ (shipped in v0.15.3, browser-verify pending)
Reported by Tobias: once pairings are generated, adding players to a pod should be deactivated — to add more, the pod needs to be unpaired first (via the existing "Undo pairing" button).

**Root cause:** `canModifyRoster` (`PodPage.tsx`, `rounds.length === 0 || lastRound?.status === "COMPLETED"`) already gates drop/undrop, but the "+ Add players" / "+ Add team" UI was never gated by anything at all — always enabled regardless of round state. Server-side, `POST /api/pods/:id/entrants` (`pods.ts`) had no round check either. Someone added mid-tournament would have 0 matches for every round already generated, breaking the "everyone plays everyone" assumption pairing/standings are built on.

**Fixed:** a new, deliberately **stricter** gate than `canModifyRoster` — `canAddEntrants = rounds.length === 0` — no "between completed rounds" allowance, since a newly-added entrant is never safe once round 1 exists at all, only before it. `IndividualEntrants`/`TeamEntrants` hide the add UI behind it, showing "Round 1 has already been paired — undo the pairing on the Pairings tab to add more" instead. Server-side, the route now checks `round.count` for the pod and refuses (`pod_already_paired`) before either the team or individual/bulk add path runs — enforced independently of the UI, not just disabled client-side.

- [x] Fixed both client and server, `tsc -b`/`eslint`/`prettier` clean.
- [x] **Follow-up (2026-09-16), closing the gap flagged above:** Tobias asked for the mirror-image rule too — "Remove" hidden once a pod has started, "Drop" only available once it has (not before). Per-entrant row now shows exactly one of the two, picked by `canAddEntrants`, instead of both simultaneously. Enforced server-side as well: `DELETE /api/entrants/:id` now refuses (`pod_already_paired`, reusing the add-side's code) once any round exists — closing the exact hard-delete/cascade risk this entry originally flagged as unaddressed; `POST /api/entrants/:id/drop` now refuses (`pod_not_started`) when no round exists yet, so a drop can no longer record a meaningless `droppedAfterRound: 0` before the pod has even begun.
- [ ] **Not yet browser-verified** — sandbox has no DB/browser, and no route-level tests exist for `pods.ts` (matches this codebase's established convention — only service-layer functions get real-DB tests). Tobias should confirm: generate round 1, confirm the add-players/add-team UI is replaced by the explanatory message, then undo the pairing and confirm adding works again; also confirm each entrant row shows Remove before round 1 exists and Drop/Un-drop after, never both.

## Project-health backlog (from the 2026-09-06 code audit)

Not feature work — these harden the project itself. Nothing genuinely open remains here at the moment; the CI / lint / release / hardening / performance keystones (PI-88–92, 93–95, 98) are all shipped and in the build log.

## Ideas (unlikely to be built)

Things that came up as a possible feature but that Tobias doesn't expect to actually build — kept here for the scoping/context in case priorities ever change, not active backlog. Don't pick one of these up without checking with him first.

### PI-62 — Deck photos (parked 2026-09-14)
Idea from Tobias (2026-08-31): on a pod's standings page, let each entrant have a photo of their drafted deck attached. Scoped via a full interview before any code — see `docs/BUILD-LOG.md` git history / this file's own prior revisions for the complete scoping notes if it's ever revisited. Short version of what was decided:

- **The app's first-ever user-uploaded file** — every prior "image" in the app (Scryfall card art) is a hotlinked external URL; `PLAN.md`/`CLAUDE.md` explicitly rule out file uploads elsewhere (PI-31) as a deliberate scope boundary this would cross.
- Organizer-upload v1, player self-upload later (on top of PI-52's player auth); local-disk storage (a new bind-mounted volume, no S3); validate + re-encode through `sharp` (a new dependency) to reject non-images and strip embedded metadata/polyglot payloads; a generated preview shown by default, original available via explicit zoom/download actions; public visibility matching the rest of standings but hidden-by-default behind a modal.
- Real open questions flagged at scoping time and never resolved: new file-serving routes respecting the PI-27 password lock, filesystem cleanup on delete (the app's first delete path with a non-DB side effect), and a second thing (the photo volume) for self-hosters to back up.

Parked because it's "more involved" than the rest of the backlog for a feature Tobias isn't confident anyone would actually use — not rejected for a technical reason, just deprioritized indefinitely.
