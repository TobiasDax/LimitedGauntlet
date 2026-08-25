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

### PI-23 — Bug: Hall of Fame crown badge renders above the header menu
The 👑 crown badge on the Hall of Fame scrolls *over* the top-bar menu instead of under it — a z-index / stacking-context issue, so on scroll the crown overlaps the nav. Low severity, but fix down the road.
- [ ] Find the crown badge's stacking context (likely a `z-` class or positioned ancestor in `HallOfFameOverview.tsx` / `HallOfFameList`) and ensure the sticky/fixed header (`Layout.tsx` top bar) sits above it.
- [ ] Verify by scrolling a real Hall of Fame page with crowns in the viewport, both authed and public.

### PI-24 — Active-page indicator in the nav + keyboard/focus accessibility
The top-bar menu has no visual indicator of the current page. Add a modern active state, and while in there, make the nav properly usable for keyboard / assistive-tech users.
- [ ] Active nav item: **bold text + underline, in the main accent color** (`--color-accent`), via React Router `NavLink`'s `isActive`, applied in both `Layout.tsx` (authed) and `PublicLayout.tsx` (public). Check the accent-on-active-nav contrast holds against the dark top bar.
- [ ] Keyboard/a11y pass: visible focus ring on tabbed-through nav items (don't strip `outline` without replacing it), sensible focus order, `aria-current="page"` on the active link, adequate contrast on the focus indicator against the dark theme.

### PI-25 — Hamburger menu on mobile
Alongside the PI-24 nav work, collapse the top bar into a hamburger menu on small screens so it's smaller and easier to navigate on a phone.
- [ ] Below a breakpoint, collapse nav links into a toggle (hamburger) that opens a menu; keep the wordmark + (authed) log-out reachable.
- [ ] Accessible: button has an `aria-label`/`aria-expanded`, menu is keyboard-navigable and closes on Escape / outside click. Applies to both `Layout` and `PublicLayout`.
- [ ] Re-check the phone-width overflow the responsive pass already fixed (see build log Step 9 Phase E) still holds.

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

### PI-32 — Secondary link color for Edit buttons (muted blue)
Introduce a secondary link/action color, distinct from the accent — mainly for the "Edit" affordances (description, pod, tournament). A muted blue is the proposed direction.
- [ ] Add a `--color-link-secondary` (or similar) token to `client/src/index.css`'s `@theme` block; a muted blue that clears WCAG 4.5:1 against both `bg` and `surface` (validate the contrast, don't eyeball — same rigor as PI-10).
- [ ] Apply to the Edit links/buttons (description edit, edit pod, edit tournament) so they read as secondary actions, not primary accent.
