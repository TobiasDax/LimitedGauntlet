# Roadmap

**Read this first in a new session.** It's the short list of what's shipped and what's still open. Design rationale lives in [`PLAN.md`](PLAN.md); the full detailed history of how everything was built and verified is archived in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md) — you rarely need to read that unless you're touching a specific past feature.

## Status

The app is **feature-complete and running in production**. The whole numbered build (Steps 0–12) and post-1.0 backlog PI-1 through PI-21 are done — see `docs/BUILD-LOG.md` for the blow-by-blow. What's left is a small tail of open items plus whatever new improvements land below.

## Open items

### PI-22 — Publish a real GitHub release (not just the rolling `main`)
The repo is public on GitHub but has no tagged release: no `version` in any `package.json`, `git tag -l` is empty, no GitHub Release with notes. Fine for a deploy that tracks `main`, but no stable reference point / changelog for anyone else.
- [ ] Decide a version scheme + starting number — semver `v0.1.0` (README calls it "solid beta") is the obvious default; confirm with Tobias.
- [ ] Add `"version"` to the root `package.json` (decide whether `server`/`client`/`mcp` track independently or inherit).
- [ ] Write human-readable release notes summarizing PI-1…PI-21 + Steps 0-12 (the build log is the source; the release is the summary).
- [ ] `git tag vX.Y.Z` + push, then create the GitHub Release (`gh release create` once `gh` is available/authed).
- [ ] Optional, don't block the first release: publish Docker images to GHCR via a release-triggered Action so "deploy this" doesn't require a local build.

## New improvements (backlog)

_New feature requests go here. Keep each one self-contained enough to pick up cold in a future session, then move it to `docs/BUILD-LOG.md` once shipped. Not a strict sequence — pick them up independently, but note the groupings below._

Rough groupings (interlocking work worth doing together): **nav overhaul** = PI-24 + PI-25 (do alongside PI-23); **settings page** = PI-26 is the shell that PI-27, PI-28 live in, and PI-29 (SMTP) supports PI-28's email change.

> **Verification note:** this sandbox can't run the app (no Docker) or even a full `vite build` (Windows Application Control blocks rollup/esbuild native binaries). Frontend items below are typechecked (`tsc -b`) but **not yet browser-verified** — that step waits for a real running instance. Items marked ✅ are code-complete + typechecked; their "verify in a browser" sub-tasks stay unchecked until then.

### PI-23 — Bug: Hall of Fame crown badge renders above the header menu ✅ (code-complete, browser-verify pending)
The 👑 crown badge on the Hall of Fame scrolls *over* the top-bar menu instead of under it — a z-index / stacking-context issue, so on scroll the crown overlaps the nav. Low severity, but fix down the road.
- [x] Root cause: the crown container was `relative z-10` (`HallOfFameOverview.tsx`) and the sticky header was also `z-10` (`Layout.tsx`) — equal z-index, crown later in the DOM, so it painted over the header. Fix: crown lowered to `z-[1]` (it only needs to beat the row's overlay link) and the sticky header raised to `z-30` (now via the shared `TopBar`), so the header always wins over content.
- [ ] Verify by scrolling a real Hall of Fame page with crowns in the viewport, both authed and public.

### PI-24 — Active-page indicator in the nav + keyboard/focus accessibility ✅ (code-complete, browser-verify pending)
The top-bar menu has no visual indicator of the current page. Add a modern active state, and while in there, make the nav properly usable for keyboard / assistive-tech users.
- [x] Active nav item: **bold + underline in the accent color** via `NavLink`'s `isActive`, in the shared `TopBar` used by both `Layout` and `PublicLayout`. Home links use `end` so `/` (and `/o/:slug`) aren't active on every route.
- [x] Keyboard/a11y: `focus-visible` outline ring (accent) on every nav item and the hamburger; `NavLink` emits `aria-current="page"` automatically. Focus ring uses the accent, which clears contrast on the dark bar.
- [ ] Verify keyboard tabbing + screen-reader `aria-current` in a real browser.

### PI-25 — Hamburger menu on mobile ✅ (code-complete, browser-verify pending)
Alongside the PI-24 nav work, collapse the top bar into a hamburger menu on small screens so it's smaller and easier to navigate on a phone.
- [x] Below `sm:` the nav + right slot collapse into a hamburger toggle (`TopBar`) that drops a full-width menu panel; the wordmark + log-out stay reachable (log-out moves into the panel on mobile).
- [x] Accessible: toggle has `aria-label`/`aria-expanded`/`aria-controls`; menu closes on Escape, on outside click, and on selecting a link.
- [ ] Verify the phone-width overflow fix (build log Step 9 Phase E) still holds, in a real 390px viewport.

### PI-26 — Organizer Settings page (shell + relocate API Tokens)
Introduce a dedicated Settings area for organizer-scoped config. Right now only API Tokens would live there, but it declutters the top-bar nav and is the home for PI-27/PI-28.
- [ ] New `SettingsPage` (authed) with a sub-nav/sections; move the existing API Tokens management (`ApiTokensPage`) into it and drop the standalone "API Tokens" top-bar link.
- [ ] Route + nav link ("Settings"). Keep it organizer-only (session auth), never bearer-token-auth'd (same reasoning as the API-token routes in the build log's PI-4).

### PI-27 — Optional password lock for public pages (Settings)
Some organizers won't want fully-open public links. Let an organizer optionally set a password that gates their org's public (`/o/:slug/...`) pages.
- [ ] Decided: this is the sanctioned exception to "public pages stay open by default" — `CLAUDE.md`'s public-pages line has been softened to allow an **opt-in, off-by-default, per-org** lock. Must stay off unless the organizer explicitly turns it on.
- [ ] Setting in the Settings page: enable/disable + set/clear password (hashed, argon2, same as organizer passwords).
- [ ] Public routes: when a lock is set, gate access behind a lightweight password prompt (a per-visitor cookie/token once entered), without turning the slug itself into a secret. Keep it frictionless when *not* locked (unchanged behavior).

### PI-28 — Account management: change email / password, delete account (Settings)
The organizer needs to manage their own account. Lives in the Settings page.
- [ ] Change password, change email address, delete account.
- [ ] **Destructive/sensitive actions gated behind re-entering the current password** (password change, email change, account deletion). Account deletion must handle the org's data (what happens to the organization + its tournaments — decide: block if last organizer, or cascade with a hard confirm).
- [ ] Email change likely needs verification → depends on PI-29 (SMTP).

### PI-29 — Transactional email via SMTP
Supports PI-28's email-change verification (and any future notifications). Bigger task; prefer a well-maintained library over hand-rolling.
- [ ] Use a mature library (e.g. `nodemailer`) with SMTP config via env vars (host/port/user/pass/from), consistent with the app's existing env-driven config convention.
- [ ] **Security/anti-spam:** app only sends to its own organizers' addresses (no user-supplied arbitrary recipients), rate-limit sends, no open relay surface. Verification links are single-use + expiring. Fail gracefully / clearly if SMTP isn't configured (features that need it degrade, don't crash).
- [ ] Optional for self-hosters: keep SMTP optional so the app still runs without it (email-change just unavailable until configured).

### PI-30 — Rename "Gesamtwertung" → "Tournament Standings"
The tournament-wide standings feature/page uses a German term; rename it to **"Tournament Standings"** for a broader audience (deliberately *not* "Weekend Standings" — not every tournament spans a weekend).
- [ ] Rename across UI labels, routes if desired, component/hook names (`GesamtwertungList`, `useGesamtwertung`, `computeGesamtwertung`, endpoint paths) — decide how deep the rename goes (user-facing only vs. code too). Update PLAN.md/README wording.

### PI-31 — Richer Markdown for tournament descriptions
The tournament description (built in the build log's PI-8 as a safe minimal renderer — plain text + auto-linked URLs + `[label](url)` only) should support fuller Markdown so detailed descriptions can be crafted. **No file uploads.**
- [ ] Support headings, ordered/unordered lists, bold/italic/underline, tables, etc.
- [ ] **Keep the XSS-safe posture** PI-8 established — no raw HTML / `dangerouslySetInnerHTML`. Use a Markdown lib with a safe React renderer (or a sanitizer); no image/file upload surface.
- [ ] Editor UX: the `Textarea` stays plain Markdown source, or add light preview — decide during implementation. Renders on both `TournamentPage` (authed) and `PublicTournamentPage`.

### PI-32 — Secondary link color for Edit buttons (muted blue) ✅ (code-complete, browser-verify pending)
Introduce a secondary link/action color, distinct from the accent — mainly for the "Edit" affordances (description, pod, tournament). A muted blue is the proposed direction.
- [x] Added `--color-link` (#7c9cbb, muted steel blue) + `--color-link-strong` (#9bb6d0, hover) to `index.css`'s `@theme`. Contrast checked via Node, not eyeballed: link vs bg 6.52 / surface 6.06 / raised 5.52; strong 8.89 / 8.26 / 7.53 — all clear 4.5:1 with headroom.
- [x] Applied `text-link hover:text-link-strong` to the Edit affordances: description edit + edit-tournament (`TournamentPage`), edit-pod (`PodPage`), and the reported-score Edit link (`PairingsPage`).

### PI-33 — Standalone pre-round timer (draft / deck-building)
The round timer today only exists once a round is paired (it counts down from `Round.endsAt`). But a pod needs a timer *before* any round — for draft + deck-building time. Add a timer an organizer can start on a pod without pairing a round.
- [ ] Configurable length, **default 50 min**. Runs on a pod independent of rounds; startable from the pod page (and shown on the public pod page + Display Mode, same as the round timer).
- [ ] Reuse the existing client-side countdown (`lib/useCountdown.ts`) + realtime broadcast plumbing rather than a parallel system — likely a pod-level `timerEndsAt`/`timerLabel` the same way rounds carry `endsAt`, broadcast over the existing pod socket room so every device shows it live. Should not interfere with (or require) an active round.
