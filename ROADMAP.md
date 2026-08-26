# Roadmap

**Read this first in a new session.** It's the short list of what's shipped and what's still open. Design rationale lives in [`PLAN.md`](PLAN.md); the full detailed history of how everything was built and verified is archived in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md) — you rarely need to read that unless you're touching a specific past feature.

## Status

The app is **feature-complete and running in production**, with a first tagged release out ([v0.1.0](https://github.com/TobiasDax/LimitedGauntlet/releases/tag/v0.1.0)). The whole numbered build (Steps 0–12) and post-1.0 backlog PI-1 through PI-21 are done — see `docs/BUILD-LOG.md` for the blow-by-blow. What's left is whatever new improvements land below.

## Open items

_None currently — PI-22 (below) was the last one._

## New improvements (backlog)

_New feature requests go here. Keep each one self-contained enough to pick up cold in a future session, then move it to `docs/BUILD-LOG.md` once shipped. Not a strict sequence — pick them up independently, but note the groupings below._

Rough groupings (interlocking work worth doing together): **nav overhaul** = PI-24 + PI-25 (do alongside PI-23); **settings page** = PI-26 is the shell that PI-27, PI-28 live in, and PI-29 (SMTP) supports PI-28's email change.

> **Verification note:** this sandbox can't run the app (no Docker) or even a full `vite build` (Windows Application Control blocks rollup/esbuild native binaries), so items below are built and typechecked (`tsc -b`) here, then browser-verified separately by Tobias on a real running instance. PI-23…33 were verified live 2026-08-25. Items marked ✅ (browser-verify pending) are still waiting on that step.

### PI-22 — Publish a real GitHub release (not just the rolling `main`) ✅
The repo is public on GitHub but had no tagged release: no `version` in any `package.json`, `git tag -l` empty, no GitHub Release with notes.
- [x] **Version scheme:** semver, starting at `v0.1.0`, single shared version (root `package.json` only — `server`/`client`/`mcp` stay unversioned).
- [x] Release notes drafted, tag pushed, GitHub Release created by Tobias: https://github.com/TobiasDax/LimitedGauntlet/releases/tag/v0.1.0.
- [x] GHCR image publish: `.github/workflows/docker-publish.yml`, triggered on `release: published` (+ manual `workflow_dispatch`), pushes `ghcr.io/<owner>/<repo>:0.1.0`, `:0.1`, and `:latest`.
- [x] **Forgejo→GitHub mirror gotcha, worth remembering:** `origin` here is Forgejo, not GitHub, so the tag had to actually propagate through the push-mirror before `gh release create` could see it, and `gh` needed `--repo TobiasDax/LimitedGauntlet` since it can't infer a GitHub repo from a Forgejo remote.

### PI-23 — Bug: Hall of Fame crown badge renders above the header menu ✅
The 👑 crown badge on the Hall of Fame scrolls *over* the top-bar menu instead of under it — a z-index / stacking-context issue, so on scroll the crown overlaps the nav. Low severity, but fix down the road.
- [x] Root cause: the crown container was `relative z-10` (`HallOfFameOverview.tsx`) and the sticky header was also `z-10` (`Layout.tsx`) — equal z-index, crown later in the DOM, so it painted over the header. Fix: crown lowered to `z-[1]` (it only needs to beat the row's overlay link) and the sticky header raised to `z-30` (now via the shared `TopBar`), so the header always wins over content.
- [x] Verified by scrolling a real Hall of Fame page with crowns in the viewport, both authed and public.

### PI-24 — Active-page indicator in the nav + keyboard/focus accessibility ✅
The top-bar menu has no visual indicator of the current page. Add a modern active state, and while in there, make the nav properly usable for keyboard / assistive-tech users.
- [x] Active nav item: **bold + underline in the accent color** via `NavLink`'s `isActive`, in the shared `TopBar` used by both `Layout` and `PublicLayout`. Home links use `end` so `/` (and `/o/:slug`) aren't active on every route.
- [x] Keyboard/a11y: `focus-visible` outline ring (accent) on every nav item and the hamburger; `NavLink` emits `aria-current="page"` automatically. Focus ring uses the accent, which clears contrast on the dark bar.
- [x] Verified keyboard tabbing + screen-reader `aria-current` in a real browser.

### PI-25 — Hamburger menu on mobile ✅
Alongside the PI-24 nav work, collapse the top bar into a hamburger menu on small screens so it's smaller and easier to navigate on a phone.
- [x] Below `sm:` the nav + right slot collapse into a hamburger toggle (`TopBar`) that drops a full-width menu panel; the wordmark + log-out stay reachable (log-out moves into the panel on mobile).
- [x] Accessible: toggle has `aria-label`/`aria-expanded`/`aria-controls`; menu closes on Escape, on outside click, and on selecting a link.
- [x] Verified the phone-width overflow fix (build log Step 9 Phase E) still holds, in a real 390px viewport.

### PI-26 — Organizer Settings page (shell + relocate API Tokens) ✅
Introduce a dedicated Settings area for organizer-scoped config. Right now only API Tokens would live there, but it declutters the top-bar nav and is the home for PI-27/PI-28.
- [x] New `SettingsPage` at `/settings` (inside the ProtectedRoute block) composing stacked `SettingsSection`s. API-token UI extracted to `components/settings/ApiTokensSection.tsx`; old `ApiTokensPage` deleted; `/api-tokens` now redirects to `/settings`.
- [x] Top-bar "API Tokens" link replaced with "Settings" (in the `Layout` right slot). Organizer-only via ProtectedRoute; the token routes it drives stay session-auth-only (unchanged).
- [x] `SettingsSection` wrapper is ready for PI-27/PI-28 sections to drop in.

### PI-27 — Optional password lock for public pages (Settings) ✅
Some organizers won't want fully-open public links. Let an organizer optionally set a password that gates their org's public (`/o/:slug/...`) pages. **Org-wide** (one password for the whole public surface).
- [x] Sanctioned exception to "public pages stay open by default" — `CLAUDE.md` softened accordingly. Off by default.
- [x] Schema: `Organization.publicPasswordHash String?` (migration `20260825110000_add_org_public_password`). Settings route (`settings.ts`, session-auth only, never bearer): `PUT /api/settings/public-lock` (argon2 hash) + `DELETE` to disable. `GET /auth/me` (and login) now return `publicLockEnabled`.
- [x] Public gating: an encapsulated `preHandler` on `publicRoutes` 401s `{error:"locked"}` for every data route when the org has a password and the visitor hasn't unlocked. Exempt: `GET .../lock` (status) and `POST .../unlock` (verify + mark unlocked in the encrypted session cookie; rate-limited 10/min like login). Slug stays shareable — the password is the gate, not secrecy of the URL.
- [x] Frontend: `PublicLockSection` in Settings (enable/change/disable). `PublicLayout` checks lock status first and renders `PublicUnlockPrompt` when locked+not-unlocked, so gated child queries never fire; unlocking invalidates the `["public"]` cache so everything refetches. Added `api.put`.
- [x] Live/browser verification done.

### PI-28 — Account management: change email / password, delete account (Settings) ✅
The organizer needs to manage their own account. Lives in the Settings page (`AccountSection`). All three sensitive actions verify the current password.
- [x] **Change password** — `POST /api/settings/password` (verify current, set new, immediate; rate-limited 10/min). Client-side confirm-match.
- [x] **Change email** — `POST /api/settings/email` (password-gated) creates a single-use, 1-hour `EmailChangeRequest` (SHA-256 token hash, migration `20260825120000_add_email_change_request`) and emails a `/verify-email?token=…` link to the **new** address via PI-29. Public `POST /api/auth/verify-email-change` applies it (re-checks uniqueness, marks used). New `VerifyEmailPage` route. Returns 503 if SMTP unconfigured (clear UI message).
- [x] **Delete account** — `POST /api/settings/delete-account`: verify password AND type the exact org name, then delete the organization (cascades to organizers/players/tournaments/pods/cards). Clears the session; client clears cache and redirects to `/login`. Revised further under PI-34 for multi-organizer orgs.
- [x] Browser + live-email verification done. (Note: the email form shows even when SMTP is unconfigured and surfaces the 503 message on submit — could hide it proactively by exposing an `emailConfigured` flag if wanted.)

### PI-29 — Transactional email via SMTP ✅
Prerequisite for PI-28's email-change verification (and any future notifications).
- [x] `nodemailer` transport built lazily from env config (`config.smtp`: host/port/user/pass/from/secure) + `APP_BASE_URL`. `services/mailer.ts`: `sendMail`, `isEmailConfigured`, `resolveBaseUrl`. Env documented in `.env.example` + passed through `docker-compose.yml`.
- [x] **Optional/degrades cleanly:** if `SMTP_HOST`/`SMTP_FROM` unset, `isEmailConfigured()` is false and `sendMail` throws `email_not_configured` — the app runs fine, email-dependent features (PI-28 email change) just aren't offered.
- [x] **Anti-spam posture:** the mailer is only wired to first-party account flows (PI-28 sends to the organizer's own new address; PI-34 co-organizer invites send to an address the inviting organizer supplies, which is the one deliberate exception — an org owner adding someone to their own org). Single-use + expiring verification tokens live in the PI-28/PI-34 flows.
- [x] Live verification (actually sending) done.

### PI-30 — Rename "Gesamtwertung" → "Tournament Standings" ✅
The tournament-wide standings feature/page uses a German term; rename it to **"Tournament Standings"** for a broader audience (deliberately *not* "Weekend Standings" — not every tournament spans a weekend).
- [x] **Scope decision: user-facing text only.** Renamed the three rendered strings (`GesamtwertungPage` title + "Weekend overview"→"Tournament overview" fallback, `PublicTournamentPage` heading, `TournamentPage` "View standings" link) plus the README's user-facing mentions (feature list + screenshot alt).
- [x] **Deliberately NOT renamed:** code identifiers (`GesamtwertungList`, `useGesamtwertung`, `computeGesamtwertung`, types), API endpoint paths, JSON response keys, query keys, the `/gesamtwertung` client route, and the historical German term in PLAN.md/BUILD-LOG.md (it's the real term the group used). The German word only hurts where a broad audience *reads* it (the UI); renaming endpoints/hooks is a cross-package (client/server/mcp/tests) API-contract ripple with zero user value and no runtime verification available here. A code-level rename is a separate mechanical pass if ever wanted.

### PI-31 — Richer Markdown for tournament descriptions ✅
The tournament description (built in the build log's PI-8 as a safe minimal renderer — plain text + auto-linked URLs + `[label](url)` only) should support fuller Markdown so detailed descriptions can be crafted. **No file uploads.**
- [x] `RichText` now renders full Markdown via `react-markdown` + `remark-gfm`: headings, ordered/unordered lists, **bold**/*italic*/<u>underline</u>, tables, code, blockquotes, strikethrough, links. Element styling centralized in a `.markdown` CSS scope (`index.css`) since Tailwind preflight strips defaults.
- [x] **XSS-safe:** react-markdown emits React nodes (no `dangerouslySetInnerHTML` for the Markdown). `rehype-raw` lets literal tags through only so `<u>` works, but `rehype-sanitize` runs after it with a strict allowlist that **drops `img`** (no image/file-embed surface) and adds only `u`. Links forced to `target=_blank rel=noopener noreferrer`.
- [x] Editor stays plain Markdown source (no live preview) with a "Markdown supported" hint on both the create form (`DashboardPage`) and the inline edit-in-place (`TournamentPage`). Renders on `TournamentPage` (authed) + `PublicTournamentPage`. Server description cap raised 4000→10000 for detailed content.
- [ ] Nice-to-have not built: a live side-by-side preview while editing.

### PI-32 — Secondary link color for Edit buttons (muted blue) ✅
Introduce a secondary link/action color, distinct from the accent — mainly for the "Edit" affordances (description, pod, tournament). A muted blue is the proposed direction.
- [x] Added `--color-link` (#7c9cbb, muted steel blue) + `--color-link-strong` (#9bb6d0, hover) to `index.css`'s `@theme`. Contrast checked via Node, not eyeballed: link vs bg 6.52 / surface 6.06 / raised 5.52; strong 8.89 / 8.26 / 7.53 — all clear 4.5:1 with headroom.
- [x] Applied `text-link hover:text-link-strong` to the Edit affordances: description edit + edit-tournament (`TournamentPage`), edit-pod (`PodPage`), and the reported-score Edit link (`PairingsPage`).

### PI-33 — Standalone pre-round timer (draft / deck-building) ✅
The round timer today only exists once a round is paired (it counts down from `Round.endsAt`). But a pod needs a timer *before* any round — for draft + deck-building time. Add a timer an organizer can start on a pod without pairing a round.
- [x] Schema: `Pod.prepTimerEndsAt DateTime?` + `Pod.prepTimerLabel String?` (migration `20260825100000_add_pod_prep_timer`, additive nullable columns). Independent of rounds — works with zero rounds paired.
- [x] Backend: `POST /api/pods/:id/prep-timer` (`{minutes (default 50), label?}`) and `DELETE .../prep-timer`, org-scoped; both broadcast `prep-timer-updated` on the pod room. `usePodRealtime` now invalidates on that event.
- [x] Frontend: reuses `useCountdown` (ticks client-side off `prepTimerEndsAt`). `PrepTimer` control (start length + optional label + Stop) on `PodPage`; read-only `PrepTimerDisplay` on `PublicPodPage` (large) and `PairingsPage` (enlarges in Display Mode). Live across devices via the existing socket.
- [x] Browser-verified. No chime wired (round-timer-only, per scope); MCP tools not added (organizer UI action, not a bulk op).

### PI-34 — Multiple organizers per org + explicit "delete organization" ✅ (code-complete, browser-verify pending)
Split out from the PI-28 account-deletion decision (2026-08-25). The data model already allows multiple `OrganizerAccount`s per org, but there's no way to add one, and no standalone org-delete.
- [x] **Invite/add co-organizers** to an organization. New `OrganizerInvite` model (migration `20260825130000_add_organizer_invite`) — single-use hashed token, 7-day expiry, same pattern as PI-28's `EmailChangeRequest`. `GET/POST /api/settings/organizers[/invite]`, `DELETE .../invites/:id`, `DELETE .../organizers/:id` (session-auth only); public `GET /api/auth/invite/:token` + `POST /api/auth/accept-invite` (invitee sets their own name/password, logged in immediately). Requires SMTP (PI-29) — no other way to deliver the link. Roles equal for v1: an accepted invite is a full `OrganizerAccount`, same access as anyone else. Frontend: new "Organizers" section in Settings (invite form, organizer list, pending-invite list) + `AcceptInvitePage` at `/accept-invite`.
- [x] **Explicit "delete organization"** action (`POST /api/settings/delete-organization`, hard-gated: password + type org name) — always deletes the whole org regardless of organizer count. Distinct from "delete my account". Only shown in Settings when `organizerCount > 1` (for a solo organizer, "Delete account" already does this — a second identical-looking danger button would just be clutter).
- [x] Revisited PI-28's cascade: `POST /api/settings/delete-account` now checks `organizerCount` — if >1, it only removes the caller's own `OrganizerAccount` ("leave organization", confirmed by typing your own email) and leaves the org untouched; if it's the last organizer, unchanged full-org-delete behavior (confirmed by typing the org name). `organizerCount` added to `/auth/login` and `/auth/me` responses so the frontend knows which copy/behavior to show.

### PI-35 — Footer bar with legal links and GitHub link ✅ (code-complete, browser-verify pending)
Add a site-wide footer bar: legal links (e.g. Impressum/Privacy — decide what's actually needed for a self-hosted OSS app vs. what individual deployers should supply) and a link to the GitHub repo.
- [x] **Scope decided:** GitHub + License links ship built-in (no legal content of our own). A third link is a deployer-configured slot: `LEGAL_LINK_URL` + `LEGAL_LINK_LABEL` env vars, surfaced via a new public `GET /api/app-config` (`server/src/routes/auth.ts`, config in `server/src/config.ts`), rendered only when both are set. Documented in `.env.example` + passed through `docker-compose.yml`.
- [x] **Placement:** new shared `Footer.tsx` (`client/src/components/Footer.tsx`, backed by `useAppConfig` in `client/src/features/config/useAppConfig.ts`), rendered in both `Layout.tsx` (authed) and `PublicLayout.tsx` (public `/o/:slug/...`), after `<main>` inside the shared `min-h-screen` chrome — same "shared chrome" pattern `TopBar` already uses.
- [x] GitHub link target: `https://github.com/TobiasDax/LimitedGauntlet` (License links to `/blob/main/LICENSE` on the same repo).

### PI-36 — Constructed format dropdown (Standard, Modern, Legacy, etc.) ✅ (code-complete, browser-verify pending)
Pods with `format: CONSTRUCTED` currently don't record *which* constructed format was played. Add a dropdown for that: Standard, Modern, Legacy, Vintage, Pioneer, Pre-Modern, Pauper, plus a **Custom** option that reveals a free-text field to record an arbitrary format name.
- [x] New `ConstructedFormat` enum + `Pod.constructedFormat`/`Pod.constructedFormatCustom String?` fields (migration `20260825140000_add_pod_constructed_format`), mirroring the `setCode` optional-field pattern. Both optional; application-layer enforced (not a DB constraint) that `constructedFormat` only applies to `CONSTRUCTED` pods and `constructedFormatCustom` only pairs with the `CUSTOM` option — see `constructedFormatError()` in `server/src/routes/pods.ts`.
- [x] **Optional, not required** — a constructed pod can leave it unset. Displayed via a new `podFormatDisplay()` helper (`client/src/features/pods/usePods.ts`) as "Constructed — Modern" etc., wherever the plain format label used to show (pod header, tournament pod list, public pod/tournament pages, standings, value page).
- [x] New shared `ConstructedFormatPicker` component (`client/src/components/ConstructedFormatPicker.tsx`), wired into both `NewPodForm` (`TournamentPage.tsx`) and `EditPodForm` (`PodPage.tsx`) — shown only when `format === "CONSTRUCTED"`, same conditional pattern as the existing `SetPicker`.
- [ ] Browser-verified.

### PI-37a — 2v2 Constructed
Support the 2v2 multiplayer constructed pod type beyond 1v1. (4-player Commander was considered alongside this but dropped as out of scope for the app — 1v1/team Swiss is the model this app commits to.)
- [x] **2v2 needed zero pairing/standings changes** — confirmed the existing team-pod machinery (`Entrant` unifying individuals/teams) is already format-agnostic: no `format`-conditional branching anywhere in `pairing.ts`/`standings.ts`/`podStats.ts`/`weekendHistory.ts`. A `CONSTRUCTED` pod with `isTeamEvent: true, teamSize: 2` already pairs/scores correctly today.
- [x] **Found and fixed the one real gap:** nothing previously validated that a team-entrant's `playerIds.length` matched `pod.teamSize` — an organizer could add a "2-player team" with 1, 3, or 5 members and nothing rejected it. Fixed server-side (`POST /api/pods/:id/entrants`, `pods.ts`) with a `wrong_team_size` 400, plus a matching client-side guard + "x / N selected" hint in `TeamEntrants` (`PodPage.tsx`) that disables submit until the count matches.
- [ ] Browser-verified.

### PI-38 — Organizer data export
Give an organizer a way to export all their org's data in a machine-readable form, so it can be moved/backed up or imported elsewhere (pairs with PI-39's import).
- [ ] **Contents:** all tournaments, pods, matches — plus the Hall of Fame and the Treasure Vault (card-value data). Machine-readable (JSON), structured so PI-39 can round-trip it back in.
- [ ] **UI:** a single "Export" button on the Settings page (organizer-scoped) that opens a popup with checkboxes for what to include (tournaments/pods/matches, Hall of Fame, Treasure Vault), then downloads the file.
- [ ] Lives in an **Export / Import** section of the Settings page (shared with PI-39).

### PI-39 — Organizer data import (UI)
A UI path to import data into an organization, so imports don't require shell/`import-legacy` access.
- [ ] **v1:** accept the PI-38 export file (round-trips our own format back into an org).
- [ ] **Next step (later):** also accept the `legacy-data.json` history file that the `/import-history` skill produces — folding the existing `import-legacy.ts` flow into the UI. See PI-40 for the duplicate-org handling that needs sorting out first.
- [ ] **UI:** part of the same **Export / Import** section on the Settings page as PI-38.

### PI-40 — History import: default slug + duplicate-org handling
Cleanups to the existing `import-legacy.ts` flow (`server/src/scripts/import-legacy.ts`).
- [ ] **Default slug:** `upsertOrg()` currently defaults `IMPORT_ORG_SLUG` to `gp-eichstaett` (and name to `GP Eichstätt`) — too specific to be a useful default. Change the default slug to `gp` (reconsider the default name alongside it).
- [ ] **Duplicate-org handling — investigated:** the tool checks for an existing org **by slug only** (`findUnique({ where: { slug } })`); if the slug matches it reuses the org, and tournament/pod idempotency (matched by name) prevents duplicated rows on re-run. But **org name is not unique** — running a second import with the same *name* under a *different* slug silently creates a second org. Decide the desired behavior (e.g. warn/refuse on a name collision, or make the match/dedupe intent explicit) and implement it, especially before PI-39 exposes this via the UI where a footgun is easier to hit.

### PI-41 — Roadmap overview in the README
Surface a short roadmap snapshot in `README.md` for quick visibility, so a visitor/self-hoster can see project status and what's planned without opening `ROADMAP.md`.
- [ ] Add a brief "Roadmap" section to the README: current status (feature-complete, latest release) + a short bullet list of notable open/backlog items, linking to `ROADMAP.md` for the full detail.
- [ ] Keep it **short and pointer-style** — the canonical list stays here in `ROADMAP.md`; the README is just a teaser so the two don't drift (don't duplicate every PI item).

### PI-42 — Register / Login via OIDC
Add OIDC as a login/registration option so the app can be used with an external identity provider (self-hosted Authelia/Keycloak/etc.), alongside the existing email+password organizer accounts.
- [ ] Standard OIDC authorization-code flow; configured per-deployment via env (issuer, client id/secret, redirect URL), degrading cleanly to email+password-only when unconfigured (same optional-feature posture as SMTP in PI-29).
- [ ] **Account linking by email:** an OIDC login whose verified email matches an existing `OrganizerAccount` links to that account rather than creating a duplicate; a new email provisions a new account. Keep the session model unchanged (still `@fastify/secure-session` encrypted cookies — OIDC only establishes identity, no external session store, per the "no auth dependency beyond the DB" convention).
- [ ] Consider org/first-run semantics: how an OIDC-provisioned account maps to an organization (join-by-invite reuse of PI-34, or first login creating an org).

### PI-43 — Optional social login via Google (lower priority)
Google as a social-login provider on top of PI-42's OIDC groundwork. **Lower priority** — this is for public/general use, not needed for Tobias's own deployment right now.
- [ ] Reuse PI-42's OIDC/account-linking machinery (Google is an OIDC provider); mainly the provider config + a "Sign in with Google" button. Optional/off unless configured.

### PI-44 — Public demo instance (lower priority)
A public demo deployment so prospective self-hosters can try the app without standing one up. **Lower priority.**
- [ ] **Seed data:** reuse Tobias's real live data but **anonymize the player names** and **clean up the unfinished/untracked pods** so the demo shows a tidy, complete dataset.
- [ ] **Known demo login:** a fixed, published organizer credential (`admin@demo.com` / `admin`) so anyone can log in and click around.
- [ ] **Auto-reset:** the instance resets to a known previous state every X hours (scheduled job / re-seed), so demo visitors' edits don't accumulate.
- [ ] Decide hosting/where it lives (likely DaxLite alongside the main deploy) and how the reset is wired (cron re-seed vs. volume snapshot restore).

### PI-45 — Share popup with QR code for a pod's public link
The pod page's "Public link ↗" (`PodPage.tsx`) is currently a plain anchor that just opens the public pod page in a new tab. Turn it into a proper share affordance: a popup showing the shareable link plus a generated QR code so players can scan it to open the pod's public page on their phone.
- [ ] Clicking the share control opens a popup/modal displaying the full public URL (`/o/:slug/tournaments/:id/pods/:podId`) with a copy button, and a **QR code** encoding that same URL.
- [ ] Generate the QR client-side (add a small QR lib) — no server round-trip, works offline once the page is loaded.
- [ ] Consider reusing the same share popup for the other public surfaces (tournament page, Hall of Fame, Treasure Vault) if it generalizes cleanly, but the pod link is the primary target.
