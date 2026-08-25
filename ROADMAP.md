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

### PI-26 — Organizer Settings page (shell + relocate API Tokens) ✅ (code-complete, browser-verify pending)
Introduce a dedicated Settings area for organizer-scoped config. Right now only API Tokens would live there, but it declutters the top-bar nav and is the home for PI-27/PI-28.
- [x] New `SettingsPage` at `/settings` (inside the ProtectedRoute block) composing stacked `SettingsSection`s. API-token UI extracted to `components/settings/ApiTokensSection.tsx`; old `ApiTokensPage` deleted; `/api-tokens` now redirects to `/settings`.
- [x] Top-bar "API Tokens" link replaced with "Settings" (in the `Layout` right slot). Organizer-only via ProtectedRoute; the token routes it drives stay session-auth-only (unchanged).
- [ ] `SettingsSection` wrapper is ready for PI-27/PI-28 sections to drop in.

### PI-27 — Optional password lock for public pages (Settings) ✅ (code-complete, browser-verify pending)
Some organizers won't want fully-open public links. Let an organizer optionally set a password that gates their org's public (`/o/:slug/...`) pages. **Org-wide** (one password for the whole public surface).
- [x] Sanctioned exception to "public pages stay open by default" — `CLAUDE.md` softened accordingly. Off by default.
- [x] Schema: `Organization.publicPasswordHash String?` (migration `20260825110000_add_org_public_password`). Settings route (`settings.ts`, session-auth only, never bearer): `PUT /api/settings/public-lock` (argon2 hash) + `DELETE` to disable. `GET /auth/me` (and login) now return `publicLockEnabled`.
- [x] Public gating: an encapsulated `preHandler` on `publicRoutes` 401s `{error:"locked"}` for every data route when the org has a password and the visitor hasn't unlocked. Exempt: `GET .../lock` (status) and `POST .../unlock` (verify + mark unlocked in the encrypted session cookie; rate-limited 10/min like login). Slug stays shareable — the password is the gate, not secrecy of the URL.
- [x] Frontend: `PublicLockSection` in Settings (enable/change/disable). `PublicLayout` checks lock status first and renders `PublicUnlockPrompt` when locked+not-unlocked, so gated child queries never fire; unlocking invalidates the `["public"]` cache so everything refetches. Added `api.put`.
- [ ] Live/browser verification pending (also worth a server test for the gate once a DB is available).

### PI-28 — Account management: change email / password, delete account (Settings) ✅ (code-complete, browser-verify pending)
The organizer needs to manage their own account. Lives in the Settings page (`AccountSection`). All three sensitive actions verify the current password.
- [x] **Change password** — `POST /api/settings/password` (verify current, set new, immediate; rate-limited 10/min). Client-side confirm-match.
- [x] **Change email** — `POST /api/settings/email` (password-gated) creates a single-use, 1-hour `EmailChangeRequest` (SHA-256 token hash, migration `20260825120000_add_email_change_request`) and emails a `/verify-email?token=…` link to the **new** address via PI-29. Public `POST /api/auth/verify-email-change` applies it (re-checks uniqueness, marks used). New `VerifyEmailPage` route. Returns 503 if SMTP unconfigured (clear UI message).
- [x] **Delete account** — `POST /api/settings/delete-account`: verify password AND type the exact org name, then delete the organization (cascades to organizers/players/tournaments/pods/cards). Clears the session; client clears cache and redirects to `/login`.
- [ ] Browser + live-email verification pending. (Note: the email form shows even when SMTP is unconfigured and surfaces the 503 message on submit — could hide it proactively by exposing an `emailConfigured` flag if wanted.)

### PI-29 — Transactional email via SMTP ✅ (code-complete, live-verify pending)
Prerequisite for PI-28's email-change verification (and any future notifications).
- [x] `nodemailer` transport built lazily from env config (`config.smtp`: host/port/user/pass/from/secure) + `APP_BASE_URL`. `services/mailer.ts`: `sendMail`, `isEmailConfigured`, `resolveBaseUrl`. Env documented in `.env.example` + passed through `docker-compose.yml`.
- [x] **Optional/degrades cleanly:** if `SMTP_HOST`/`SMTP_FROM` unset, `isEmailConfigured()` is false and `sendMail` throws `email_not_configured` — the app runs fine, email-dependent features (PI-28 email change) just aren't offered.
- [x] **Anti-spam posture:** the mailer is only wired to first-party account flows (PI-28 sends to the organizer's own new address — no user-supplied arbitrary recipients). Single-use + expiring verification tokens live in the PI-28 flow.
- [ ] Live verification (actually sending) pending a configured SMTP + running instance.

### PI-30 — Rename "Gesamtwertung" → "Tournament Standings" ✅ (code-complete, browser-verify pending)
The tournament-wide standings feature/page uses a German term; rename it to **"Tournament Standings"** for a broader audience (deliberately *not* "Weekend Standings" — not every tournament spans a weekend).
- [x] **Scope decision: user-facing text only.** Renamed the three rendered strings (`GesamtwertungPage` title + "Weekend overview"→"Tournament overview" fallback, `PublicTournamentPage` heading, `TournamentPage` "View standings" link) plus the README's user-facing mentions (feature list + screenshot alt).
- [x] **Deliberately NOT renamed:** code identifiers (`GesamtwertungList`, `useGesamtwertung`, `computeGesamtwertung`, types), API endpoint paths, JSON response keys, query keys, the `/gesamtwertung` client route, and the historical German term in PLAN.md/BUILD-LOG.md (it's the real term the group used). The German word only hurts where a broad audience *reads* it (the UI); renaming endpoints/hooks is a cross-package (client/server/mcp/tests) API-contract ripple with zero user value and no runtime verification available here. A code-level rename is a separate mechanical pass if ever wanted.

### PI-31 — Richer Markdown for tournament descriptions ✅ (code-complete, browser-verify pending)
The tournament description (built in the build log's PI-8 as a safe minimal renderer — plain text + auto-linked URLs + `[label](url)` only) should support fuller Markdown so detailed descriptions can be crafted. **No file uploads.**
- [x] `RichText` now renders full Markdown via `react-markdown` + `remark-gfm`: headings, ordered/unordered lists, **bold**/*italic*/<u>underline</u>, tables, code, blockquotes, strikethrough, links. Element styling centralized in a `.markdown` CSS scope (`index.css`) since Tailwind preflight strips defaults.
- [x] **XSS-safe:** react-markdown emits React nodes (no `dangerouslySetInnerHTML` for the Markdown). `rehype-raw` lets literal tags through only so `<u>` works, but `rehype-sanitize` runs after it with a strict allowlist that **drops `img`** (no image/file-embed surface) and adds only `u`. Links forced to `target=_blank rel=noopener noreferrer`.
- [x] Editor stays plain Markdown source (no live preview) with a "Markdown supported" hint on both the create form (`DashboardPage`) and the inline edit-in-place (`TournamentPage`). Renders on `TournamentPage` (authed) + `PublicTournamentPage`. Server description cap raised 4000→10000 for detailed content.
- [ ] Nice-to-have not built: a live side-by-side preview while editing.

### PI-32 — Secondary link color for Edit buttons (muted blue) ✅ (code-complete, browser-verify pending)
Introduce a secondary link/action color, distinct from the accent — mainly for the "Edit" affordances (description, pod, tournament). A muted blue is the proposed direction.
- [x] Added `--color-link` (#7c9cbb, muted steel blue) + `--color-link-strong` (#9bb6d0, hover) to `index.css`'s `@theme`. Contrast checked via Node, not eyeballed: link vs bg 6.52 / surface 6.06 / raised 5.52; strong 8.89 / 8.26 / 7.53 — all clear 4.5:1 with headroom.
- [x] Applied `text-link hover:text-link-strong` to the Edit affordances: description edit + edit-tournament (`TournamentPage`), edit-pod (`PodPage`), and the reported-score Edit link (`PairingsPage`).

### PI-33 — Standalone pre-round timer (draft / deck-building) ✅ (code-complete, browser-verify pending)
The round timer today only exists once a round is paired (it counts down from `Round.endsAt`). But a pod needs a timer *before* any round — for draft + deck-building time. Add a timer an organizer can start on a pod without pairing a round.
- [x] Schema: `Pod.prepTimerEndsAt DateTime?` + `Pod.prepTimerLabel String?` (migration `20260825100000_add_pod_prep_timer`, additive nullable columns). Independent of rounds — works with zero rounds paired.
- [x] Backend: `POST /api/pods/:id/prep-timer` (`{minutes (default 50), label?}`) and `DELETE .../prep-timer`, org-scoped; both broadcast `prep-timer-updated` on the pod room. `usePodRealtime` now invalidates on that event.
- [x] Frontend: reuses `useCountdown` (ticks client-side off `prepTimerEndsAt`). `PrepTimer` control (start length + optional label + Stop) on `PodPage`; read-only `PrepTimerDisplay` on `PublicPodPage` (large) and `PairingsPage` (enlarges in Display Mode). Live across devices via the existing socket.
- [ ] No chime wired (round-timer-only, per scope); MCP tools not added (organizer UI action, not a bulk op). Browser-verify pending.

### PI-34 — Multiple organizers per org + explicit "delete organization"
Split out from the PI-28 account-deletion decision (2026-08-25). The data model already allows multiple `OrganizerAccount`s per org, but there's no way to add one, and no standalone org-delete.
- [ ] **Invite/add co-organizers** to an organization (invite flow — likely email-based, so depends on PI-29 SMTP). Roles TBD (all equal for v1 is fine).
- [ ] **Explicit "delete organization"** action, available even when multiple organizers remain — hard-gated (password + type org name), deletes the whole org and all its data. Distinct from PI-28's "delete my account" (which, with one organizer, happens to do the same thing).
- [ ] Revisit PI-28's cascade behavior once multi-organizer exists: "delete my account" as a non-last organizer should then just remove that account, not the org.
