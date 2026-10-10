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

**v0.17.0:** PI-143 — an automatic pre-deploy database backup. A one-shot `db-backup` Compose service dumps the database (compressed `pg_dump`, to a bind-mounted `./backups`, 20 retained) before the app container starts and therefore before `prisma migrate deploy` runs. It fires once per `docker compose up`, is fail-closed (a failed dump blocks startup, so nothing migrates without a fresh backup), and is on by default in both compose files. Compose-only — the app image is unchanged from v0.16.6.

**v0.16.6:** organizer-only internal notes on a tournament, and the public-response hardening it needed first. PI-141 — the public routes spread raw Prisma rows, so every column on `Tournament`/`Pod` was published by default and any new one would go public the moment its migration ran; replaced with explicit field allowlists (`services/publicVisibility.ts`), tests pinning the exact key set. PI-140 — a private free-text field per tournament, the counterpart to the public description, sharing one tabbed Markdown editor with it; excluded from every public surface by construction thanks to PI-141, and from the player self-service export, but included in the org export and in scope of an Art. 15 request (`docs/gdpr.md`). PI-142 — both fields autosave (on blur + a slow debounce) with no Save button, an in-place cache update to stay clear of the rate limit, retry-on-failure, and a one-level Revert. All three browser-verified.

**v0.16.5:** a pairing-correctness fix found in a real 42-entrant event. PI-138 — pods above the exact-solver's size limit pair via a greedy fallback that never backtracks, so the last two entrants left could be a pair who had already met, and it emitted that repeat silently; within-pod repeats are a documented hard rule. Greedy now repairs a forced repeat by exchanging partners with another pair, and raises `PairingError` if it genuinely cannot, exactly as the exact solver already did. PI-139 — manual pairing and swap never checked within-pod history at all; both now warn (never block) when they create a rematch. Browser-verified.

**v0.16.4:** two bug fixes reported by Tobias from a real pod. PI-136 — the seating chart identified who had round 1's bye (a labelled, differently-styled seat) on the page projected for the room, before pairings were revealed. PI-137 — a pod whose round 1 was generated for seatings but never started counted as *played*, so its auto-scored bye handed the entrant a Hall of Fame crown, a win in player stats, Gesamtwertung points, and a row in the player data export. Both code-complete with regression tests confirmed failing against the previous behaviour first — browser-verified.

**v0.16.0:** all eleven findings (PI-123–133) from the 2026-09-17 external security/functional audit. Security: PI-123 (a malformed Socket.IO join acknowledgment could crash the whole server process), PI-124 (SSO could consume a pending co-organizer invite against an unverified email), PI-125 (an attacker preregistering an account with a victim's email could hijack their first SSO login), PI-126 (on-demand withdrawal snapshots leaked a player's real name in public responses and survived anonymization), PI-127 (a public-lock unlock grant outlived password rotation/disable), and PI-128 (a password change didn't revoke other active organizer sessions). Functional: PI-129 (compressed IPv6 addresses truncated to the wrong analytics prefix), PI-130 (a CUSTOM pod's name-only rename could be wrongly rejected), PI-131 (a logged-in player could see the public password prompt for content the server already permitted them), PI-132 (realtime updates stayed dead after a public-lock change forced a reconnect), and PI-133 (a foil-only card-pull edit could silently swap to a different printing). All code-complete, typechecked, and covered by real-DB service-layer tests where this codebase's testing convention allows (route-level HTTP/realtime/client behavior is code-reviewed only, per that same convention) — all items browser/live-verified; the write-ups are in the build log.

**v0.15.3:** PI-119 (bug fix — long entrant names overflowed a seat box's border instead of wrapping), PI-120 (player portal: list the player's own pods with a self-service leave, and link tournaments to their public page), PI-121 (always-visible entrant headcount, and capacity if set, on a pod's Entrants tab), and PI-122 (bug fix — adding entrants stayed enabled after round 1 was paired; Remove and Drop are now mutually exclusive by pod state, both client- and server-enforced). PI-119, PI-121, and PI-122 are now browser-verified and closed out in the build log; PI-120 is now browser-verified too.

**v0.15.2:** two bug fixes reported by Tobias, both now live-verified and closed out in the build log. PI-117 — inviting a co-organizer whose email already had an account in a *different* org was wrongly refused; now creates the invite normally and lets the existing PI-86 "log in to accept" flow handle it. PI-118 — a pod's public standings leaked who has round 1's bye before pairings were revealed (a bye is auto-scored the instant round 1 is generated); standings now hide on the same condition as pairings and reveal together.

**v0.15.1:** PI-116 (running app version shown in the footer, linked to its GitHub release page). Now browser-verified and closed out in the build log.

**v0.15.0:** PI-92 (CI now builds the Docker image and runs a boot smoke test on every PR, closing the last gap in project-health coverage — full write-up in the build log). PI-113 (webhook SSRF hardening) and PI-39 (legacy-data.json import via the Settings UI) shipped their code here and are now fully deployed/browser-verified — closed out in the build log.

**v0.14.0:** PI-115 (split a large draft/chaos-draft pod into multiple physical tables — shape picker, pair-preserving table fill, per-table seating on both the organizer and public pages; browser/data-verified against a real 20-entrant pod, including a seat-numbering bug caught and fixed via that testing).

**v0.14.1:** a column-mode alignment bug in PI-114's responsive seating chart, caught on a real phone right after v0.14.0 shipped — column mode's empty-slot spacer for an odd entrant count wasn't taking up any vertical space, misaligning the two columns. PI-114 is now fully browser-verified and closed out in the build log.

**Live instance (DaxLite, `limited-gauntlet-live`):** running **v0.15.3** as of 2026-09-16, deploy confirmed working. Recently shipped **and** browser-verified, now in the build log: PI-75 (operator signup webhook), PI-76–84 (the pod-list cluster — reorder, finished-pods sink, Scheduled/On-demand tabs, timestamps, date dividers, pod cancel), PI-85 (deployer analytics), PI-86 (one login across multiple orgs), PI-87 (Settings/Profile split), PI-88–92 / 93 / 94 / 98 (project-health: CI on Forgejo, ESLint + Prettier, tag-triggered GHCR release, container hardening, the `@fastify/compress` hotfix, CI's PR-time image build + boot smoke test), PI-96/97 (player detail page, per-pod entrant count), PI-99/100 (pod participation fix + on-demand side events), PI-103–108 / 110 (the GDPR/DSGVO pass + privacy round 2, v0.10.0–v0.11.0), PI-112 (built-in `/legal` page, v0.12.0), PI-102 / PI-109 / PI-111 (boot-time dep guard, Prisma 7, ESLint 10 — v0.13.0), PI-115 (multi-table draft splits, v0.14.0/v0.14.1), PI-114 (responsive seating chart, v0.14.0/v0.14.1), PI-39 (legacy-data.json import UI, v0.15.0), PI-113 (webhook SSRF hardening, v0.15.0), PI-116 (footer version link, v0.15.1), PI-117 (cross-org co-organizer invite fix, v0.15.2), PI-118 (standings-reveal leak fix, v0.15.2), PI-119 (seating chart name overflow fix, v0.15.3), PI-121 (Entrants tab headcount, v0.15.3), PI-122 (add/remove/drop pairing-state bug fixes, v0.15.3).

**Dependency majors batch** (`deps/majors-2026-09`, PR #1, **shipped in v0.10.0**): argon2, nodemailer 10, Vite 8 / Vitest 5, zod 4, openid-client 6, TypeScript 7-native builds. Prisma 6→7 was split off as **PI-109** and the ESLint-stack majors as **PI-111** — both shipped in **v0.13.0** and deployed to the live instance 2026-09-10 (`migrate deploy` a no-op — schema unchanged). PI-101 (the security pass — `npm audit` was 0; now 2 dev-only advisories from the Prisma 7 CLI, see PI-109's build-log entry) closed 2026-09-10; full tranche notes are in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md).

## Open items

Only genuinely-open work lives here. Everything shipped **and** browser-verified is in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md).

Nothing open right now. The next candidates are the V2 ideas below (PI-144 life counter, PI-145 light mode); both wait for Tobias's design input.

## New improvements (backlog)

_New feature requests go here. Keep each one self-contained enough to pick up cold in a future session, then move it to `docs/BUILD-LOG.md` once it's shipped **and** browser-verified._

> **Verification note:** the dev sandbox can't run the app (no Docker) or a full `vite build`, so items are built and typechecked (`tsc -b`) there, then browser-verified separately by Tobias on a real running instance. A bare ✅ means shipped and browser-verified; "code-complete, browser-verify pending" means the code is in but not yet checked on a live deploy.

_Nothing open at the moment._

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
