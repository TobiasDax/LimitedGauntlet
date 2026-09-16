# Roadmap

**Read this first in a new session.** It's the short list of what's shipped and what's still open. Design rationale lives in [`PLAN.md`](PLAN.md); the full detailed history of how everything was built and verified is archived in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md) — you rarely need to read that unless you're touching a specific past feature. [Ideas (unlikely to be built)](#ideas-unlikely-to-be-built) at the bottom holds things that came up but aren't active backlog — don't pick those up without checking with Tobias first.

## Status

The app is **feature-complete and running in production** — latest release **v0.15.3**, public demo at [limited-gauntlet.com](https://limited-gauntlet.com). The full numbered build (Steps 0–12) and the bulk of the PI-1…PI-112 backlog are shipped and browser-verified; all of that detail is archived in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md). The roadmap below is only what's still open.

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

- **PI-120** — player portal: list the player's own pods (with self-service leave) and link tournaments to their public page. Code shipped in v0.15.3, browser-verify pending.

## New improvements (backlog)

_New feature requests go here. Keep each one self-contained enough to pick up cold in a future session, then move it to `docs/BUILD-LOG.md` once it's shipped **and** browser-verified._

> **Verification note:** the dev sandbox can't run the app (no Docker) or a full `vite build`, so items are built and typechecked (`tsc -b`) there, then browser-verified separately by Tobias on a real running instance. A bare ✅ means shipped and browser-verified; "code-complete, browser-verify pending" means the code is in but not yet checked on a live deploy.

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

## Ideas (unlikely to be built)

Things that came up as a possible feature but that Tobias doesn't expect to actually build — kept here for the scoping/context in case priorities ever change, not active backlog. Don't pick one of these up without checking with him first.

### PI-62 — Deck photos (parked 2026-09-14)
Idea from Tobias (2026-08-31): on a pod's standings page, let each entrant have a photo of their drafted deck attached. Scoped via a full interview before any code — see `docs/BUILD-LOG.md` git history / this file's own prior revisions for the complete scoping notes if it's ever revisited. Short version of what was decided:

- **The app's first-ever user-uploaded file** — every prior "image" in the app (Scryfall card art) is a hotlinked external URL; `PLAN.md`/`CLAUDE.md` explicitly rule out file uploads elsewhere (PI-31) as a deliberate scope boundary this would cross.
- Organizer-upload v1, player self-upload later (on top of PI-52's player auth); local-disk storage (a new bind-mounted volume, no S3); validate + re-encode through `sharp` (a new dependency) to reject non-images and strip embedded metadata/polyglot payloads; a generated preview shown by default, original available via explicit zoom/download actions; public visibility matching the rest of standings but hidden-by-default behind a modal.
- Real open questions flagged at scoping time and never resolved: new file-serving routes respecting the PI-27 password lock, filesystem cleanup on delete (the app's first delete path with a non-DB side effect), and a second thing (the photo volume) for self-hosters to back up.

Parked because it's "more involved" than the rest of the backlog for a feature Tobias isn't confident anyone would actually use — not rejected for a technical reason, just deprioritized indefinitely.
