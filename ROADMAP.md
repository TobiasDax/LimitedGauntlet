# Roadmap

**Read this first in a new session.** It's the short list of what's shipped and what's still open. Design rationale lives in [`PLAN.md`](PLAN.md); the full detailed history of how everything was built and verified is archived in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md) — you rarely need to read that unless you're touching a specific past feature.

## Status

The app is **feature-complete and running in production**, with a first tagged release out ([v0.1.0](https://github.com/TobiasDax/LimitedGauntlet/releases/tag/v0.1.0)). The whole numbered build (Steps 0–12) and post-1.0 backlog PI-1 through PI-21 are done — see `docs/BUILD-LOG.md` for the blow-by-blow. What's left is whatever new improvements land below.

## Open items

- [ ] **PI-46:** authorize Socket.IO subscriptions for password-locked public data.
- [ ] **PI-47:** bound and transactionalize organization imports.
- [ ] **PI-48:** make proxy trust and rate-limit identity deployment-safe.
- [ ] **PI-49:** reject conflicting OIDC subject bindings during email linking.

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

### PI-38 — Organizer data export ✅ (code-complete, browser-verify pending)
Give an organizer a way to export all their org's data in a machine-readable form, so it can be moved/backed up or imported elsewhere (pairs with PI-39's import).
- [x] **Contents:** structural `data` (players, tournaments, pods, teams, entrants, rounds, matches, card pulls) — a faithful, round-trippable dump keyed by in-pod refs (player displayName / team name), the same identity PI-39 re-resolves — plus optional **Hall of Fame** and **Treasure Vault** snapshots (derived, informational). New `server/src/services/orgExport.ts` + `GET /api/settings/export?data=&hallOfFame=&treasureVault=` (session-auth only, never bearer).
- [x] **UI:** "Export data…" button in a new **Export / Import** Settings section opens a popup (`ExportImportSection.tsx` + shared `Modal` in `ui.tsx`) with a checkbox per section; downloads `<slug>-export-<date>.json` via `useExportOrg` (direct fetch → Blob, not the JSON `api` client).
- [x] Lives in the shared **Export / Import** Settings section (with PI-39).

### PI-39 — Organizer data import (UI) ✅ (v1 code-complete, browser-verify pending)
A UI path to import data into an organization, so imports don't require shell/`import-legacy` access.
- [x] **v1:** accepts the PI-38 export file and rebuilds its `data` into the current org. New `server/src/services/orgImport.ts` (zod-validated envelope + `importOrgData`) + `POST /api/settings/import` (25MB body limit, rate-limited). Non-transactional and **idempotent at the tournament level** (same-named tournament skipped), matching `import-legacy`'s posture — re-importing is safe. Typed errors (`not_our_format`/`invalid_shape`/`unsupported_version`/`no_data`/`import_failed`) surfaced with clear UI copy.
- [x] **UI:** file picker in the same Settings section; `useImportOrg` parses/posts the file and invalidates the whole query cache on success, then shows a created/skipped summary.
- [ ] **Next step (later, not built):** also accept the `legacy-data.json` history file that the `/import-history` skill produces — folding the existing `import-legacy.ts` flow into the UI. PI-40's duplicate-org guard is now in place, clearing the way for this.

### PI-40 — History import: default slug + duplicate-org handling ✅ (code-complete, browser-verify pending)
Cleanups to the existing `import-legacy.ts` flow (`server/src/scripts/import-legacy.ts`).
- [x] **Default slug:** `upsertOrg()` now defaults `IMPORT_ORG_SLUG` to `gp` and `IMPORT_ORG_NAME` to `GP` (was `gp-eichstaett` / `GP Eichstätt` — too author-specific). README + `import-history` SKILL.md updated.
- [x] **Duplicate-org handling:** the tool checks for an existing org **by slug** (`findUnique({ where: { slug } })`) and reuses it (tournament/pod idempotency by name prevents dupes on re-run). Added a **name-collision guard**: since org name isn't unique, importing under a *different* slug when an org with the same *name* already exists now throws with a clear message (re-run with the existing slug, or set `IMPORT_ALLOW_DUPLICATE_NAME=1` to deliberately create a separate org). Closes the silent-duplicate footgun before PI-39 exposes import via the UI.

### PI-41 — Roadmap overview in the README ✅
Surface a short roadmap snapshot in `README.md` for quick visibility, so a visitor/self-hoster can see project status and what's planned without opening `ROADMAP.md`.
- [x] Added a brief "Roadmap" section to the README (between Development and History import): status + latest-release link + a short bullet list of notable backlog items (export/import, OIDC, share/QR, recent polish), linking to `ROADMAP.md` for full detail.
- [x] Kept it **short and pointer-style** — the canonical list stays here in `ROADMAP.md`; the README is a teaser (doesn't duplicate every PI item), so the two don't drift.

### PI-42 — Register / Login via OIDC ✅ (code-complete, browser-verify pending)
Add OIDC as a login/registration option so the app can be used with an external identity provider (self-hosted Authelia/Keycloak/etc.), alongside the existing email+password organizer accounts.
- [x] Standard OIDC **authorization-code + PKCE** flow via `openid-client` v5 (`server/src/services/oidc.ts`, memoized discovery). Configured per-deployment via env (`OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`, optional `OIDC_REDIRECT_URI`/`OIDC_PROVIDER_NAME`/`OIDC_SCOPE`), `isOidcConfigured()`; degrades cleanly to password-only when unset (same posture as SMTP in PI-29 — button hidden). Routes: `GET /api/auth/oidc/login` (redirect, stashes state/nonce/verifier in the session) + `GET /api/auth/oidc/callback`. Env wired into `.env.example` + both compose files; documented in `docs/deployment.md` §8.
- [x] **Account linking by verified email:** callback resolves identity in order — known `oidcSubject` → existing account by verified email (records the subject) → pending co-organizer invite for that email (provisions a passwordless account into that org, PI-34 reuse) → else refused (`oidc_no_account`). **Never creates a new org**, preserving the closed-signup posture. Session model unchanged (`@fastify/secure-session` cookie — OIDC only establishes identity, no external store). Schema: `OrganizerAccount.passwordHash` now nullable + `oidcSubject String? @unique` (migration `20260826120000_add_organizer_oidc`); password login rejects passwordless accounts; SSO-only accounts can set a first password in Settings.
- [x] **Org/first-run semantics (revised per Tobias 2026-08-26):** SSO **self-registration is supported** when `ALLOW_SIGNUP=true` — an unknown verified identity is stashed in the session and sent to a one-time **org-setup screen** (`OidcSetupPage` at `/oidc-setup`; `GET /api/auth/oidc/pending` + `POST /api/auth/oidc/complete-registration` create the org + passwordless organizer). When signups are closed, unknown identities are still refused (`oidc_no_account`), so join-by-invite/existing-only remains the closed-signup behavior. Frontend: "Sign in with <provider>" button on `LoginPage` (via `useAppConfig`) + `?error=` message mapping.
- [x] **SSO-only mode:** `LOCAL_LOGIN_DISABLED=true` (env) disables local password login + local signup so OIDC is the only way in — `POST /api/auth/login`/`/signup` return `local_login_disabled`, and `LoginPage`/`SignupPage` hide the password form + signup link (surfacing only the SSO button). Fail-safe: `isLocalLoginDisabled()` is only honoured when OIDC is actually configured, so the flag can't lock everyone out. Wired into `.env.example`, both compose files, deployment.md §8.
- [ ] **Follow-up (not built):** UI affordance for an SSO-only account to set its first password is backend-ready (`POST /api/settings/password` accepts no current password when none is set) but the Account form still always asks for a current password — a small UI tweak gated on exposing "has password" to the client.

### PI-43 — Optional social login via Google (lower priority)
Google as a social-login provider on top of PI-42's OIDC groundwork. **Lower priority** — this is for public/general use, not needed for Tobias's own deployment right now.
- [ ] Reuse PI-42's OIDC/account-linking machinery (Google is an OIDC provider); mainly the provider config + a "Sign in with Google" button. Optional/off unless configured.

### PI-44 — Public demo instance (lower priority)
A public demo deployment so prospective self-hosters can try the app without standing one up. **Lower priority.**
- [ ] **Seed data:** reuse Tobias's real live data but **anonymize the player names** and **clean up the unfinished/untracked pods** so the demo shows a tidy, complete dataset.
- [ ] **Known demo login:** a fixed, published organizer credential (`admin@demo.com` / `admin`) so anyone can log in and click around.
- [ ] **Auto-reset:** the instance resets to a known previous state every X hours (scheduled job / re-seed), so demo visitors' edits don't accumulate.
- [ ] Decide hosting/where it lives (likely DaxLite alongside the main deploy) and how the reset is wired (cron re-seed vs. volume snapshot restore).

### PI-45 — Share popup with QR code for a pod's public link ✅ (code-complete, browser-verify pending)
The pod page's "Public link ↗" (`PodPage.tsx`) was a plain anchor that just opened the public pod page in a new tab. Turned it into a proper share affordance: a popup showing the shareable link plus a generated QR code so players can scan it to open the public page on their phone.
- [x] "Share public link ↗" opens a modal (`SharePopup.tsx`, on the shared `Modal` in `ui.tsx`) with the full public URL (read-only field + Copy button, with an execCommand fallback for non-HTTPS LAN where the clipboard API is unavailable) and a **QR code** encoding it.
- [x] QR generated client-side via `qrcode.react` (`QRCodeSVG`) — pure-JS, no server round-trip, works offline once loaded. URL built from `window.location.origin` so it matches whatever host the organizer is on.
- [x] **Generalized to every public surface** (it composed cleanly): pod (primary), tournament (`TournamentPage`), org home (`DashboardPage`), Hall of Fame (`HallOfFamePage`), Treasure Chest (`TreasureChestPage`) — each old "Public link ↗" anchor is now a Share button opening the popup.

### PI-46 — Security: authorize Socket.IO subscriptions for locked public data
Codex Security finding `csf_09568eb85fba75844b9037e5` (medium, high confidence; CWE-862) found that `server/src/realtime.ts` accepts any `pod:<id>` or `tournament:<id>` room name by prefix. A visitor who still knows a shared resource ID can therefore subscribe without satisfying PI-27's organization password lock and receive future full pairing/result payloads emitted by `server/src/routes/rounds.ts`.
- [ ] **Choose and document the authorization mechanism:** either parse the existing secure-session cookie during the Socket.IO handshake, or mint a short-lived signed subscription capability from an authorized HTTP endpoint. Prefer reusing the existing session and `publicUnlocked` state unless Socket.IO/Fastify integration makes that materially brittle.
- [ ] Resolve every requested pod/tournament room to its organization before joining. Permit access only when the socket represents an organizer in that organization, the organization has no public lock, or the session's `publicUnlocked` list contains that organization ID. Reject malformed, nonexistent, cross-org, and locked rooms without revealing extra resource details.
- [ ] Replace full `round`/`match` broadcast payloads with minimal invalidation events where the clients only refetch through the authorized HTTP API. Keep event names and IDs only where the client genuinely needs them.
- [ ] Add server-level Socket.IO tests covering unlocked public access, successful password unlock, same-org organizer access, locked-out visitors, stale known IDs, cross-org IDs, malformed rooms, and reconnect/session behavior.
- [ ] **Acceptance:** a locked-out socket cannot receive pairing, score, timer, or standings events for the locked organization; authorized public and organizer clients still update live; the HTTP public-lock behavior remains unchanged.
- [ ] Re-run finding verification against `server/src/realtime.ts:16-18`, `server/src/routes/rounds.ts:121,349`, and `server/src/routes/public.ts:41-49` before marking complete.

### PI-47 — Security: bound and transactionalize organization imports
Codex Security finding `csf_86d99714c3f7c9b0b2c21419` (medium, high confidence; CWE-400) found that PI-39's 25 MiB import accepts unbounded nested arrays and performs sequential per-record Prisma writes without rollback. One organizer session can amplify a compact upload into excessive shared database work and durable storage.
- [ ] Define explicit, product-realistic maximum lengths and cardinalities for players, tournaments, pods, teams/members, entrants, rounds, matches, card pulls, descriptions, and other stored strings in `server/src/services/orgImport.ts`.
- [ ] Add one aggregate preflight budget (total records and estimated database writes) and reject the whole document before the first write when any per-field or aggregate limit is exceeded. Return a stable typed error that the import UI can explain.
- [ ] Wrap each accepted import in a Prisma transaction so validation/reference/constraint failures leave no partial rows. Decide and document whether the transaction covers the complete file or one independently rollback-safe tournament at a time.
- [ ] Replace safe per-row writes with bounded batches/`createMany` where practical, and enforce an active-import concurrency limit. Add a documented per-organization quota or explicitly record why deployment-level storage monitoring is the chosen residual control.
- [ ] Add tests at every boundary: exact limit accepted, limit + 1 rejected, aggregate budget exceeded, deeply nested high-cardinality input, concurrent attempts, late reference failure rollback, and ordinary PI-38 export round-trip compatibility.
- [ ] **Acceptance:** over-budget imports fail before durable writes; a failed accepted import leaves no partial data; concurrent imports cannot monopolize the shared database; normal exports still round-trip successfully.
- [ ] Re-run finding verification against `server/src/services/orgImport.ts:83-102,148-319` and `server/src/routes/settings.ts:372-384` before marking complete.

### PI-48 — Security: make proxy trust and rate-limit identity deployment-safe
Codex Security finding `csf_15c64d317da4d05b9e578f79` (medium, high confidence; CWE-307) found that global `trustProxy: true` lets a client reaching the app directly rotate `X-Forwarded-For` values and obtain fresh authentication rate-limit buckets. This conflicts with the Compose files publishing the listener directly and the documented LAN deployment option.
- [ ] **Deployment intent (Tobias, 2026-08-26):** optimize the shipped/default Compose setup for Cloudflare Tunnel running as a container on the same device and shared private Docker network. The app should not publish its port to the host in that default mode; the tunnel is the only ingress and the app explicitly trusts that single proxy boundary.
- [ ] Replace unconditional `trustProxy: true` with explicit deployment configuration for trusted proxy addresses, Docker-network CIDR, or a narrowly justified hop count. Fail clearly on invalid configuration; do not trust arbitrary direct peers merely because proxy mode is enabled.
- [ ] Ensure the documented reverse-proxy/tunnel configuration overwrites attacker-supplied forwarding headers. Where a peer is not an explicitly trusted proxy, derive the rate-limit key from the socket peer address.
- [ ] Preserve direct/LAN and other self-hoster deployments as explicit alternatives: they opt into host-port publishing and default to no proxy trust unless they separately configure a known proxy. Do not assume external users share Tobias's topology.
- [ ] Document recommended examples for the default Cloudflare Tunnel container topology, direct LAN, and a conventional reverse proxy in `.env.example`, both Compose files, and `docs/deployment.md`, including Docker networking, port exposure, trusted peers/hops, and required header-overwrite behavior.
- [ ] Add integration tests showing that rotated forwarding headers do not rotate buckets for direct clients, known proxies preserve the real client IP, unknown proxies cannot influence it, and login/signup/public-unlock limits still trigger as configured.
- [ ] **Acceptance:** rate-limit identity is attacker-independent on every documented ingress mode, while proxied deployments retain correct per-client bucketing and direct LAN deployments continue to work.
- [ ] Re-run finding verification against `server/src/index.ts:40-48,99-102`, `server/src/routes/auth.ts:200-219`, and the Compose port mappings before marking complete.

### PI-49 — Security: reject conflicting OIDC subject bindings
Codex Security finding `csf_75d7f7bccdd1a727f883f142` (medium, medium confidence; CWE-287) found that PI-42's verified-email fallback authenticates an existing organizer even when that account is already bound to a different `oidcSubject`. If the provider reassigns or duplicates a verified email, the new subject could receive the existing organizer session.
- [ ] **Implementation checkpoint (2026-08-26):** the conflicting-subject callback no longer creates a session; the server now creates hashed, expiring relink requests, confirms them transactionally, rotates an account `authVersion`, revokes API tokens, and disconnects realtime sockets. Schema migration and server/client typechecks pass. Still required before this item is complete: recovery confirmation UI, operator CLI that consumes only verified pending requests, realtime `authVersion` enforcement, focused tests, and the post-patch adversarial review.
- [ ] **Identity intent (Tobias, 2026-08-26):** Pocket ID is the intended provider. A Pocket ID account may be deleted and recreated with the same mailbox but a different subject. Existing subject bindings remain authoritative for normal login, but possession of the existing email mailbox is accepted as the recovery authority for an explicit relink.
- [ ] In `linkOrProvisionFromOidc`, allow email-based first linking only when the matching account has no `oidcSubject`. If a non-null subject differs, do **not** create a session immediately: return a generic recovery-required result and log a safe security event without claims or secrets.
- [ ] Keep the known-subject path authoritative and preserve the current state, nonce, PKCE, `email_verified`, and unique-subject controls.
- [ ] Implement an explicit subject-relink recovery flow: create a single-use, short-lived hashed recovery token; send its link to the existing account email through the configured SMTP transport; only after confirmation replace `oidcSubject`. Bind the token to the organizer, pending new subject, email, purpose, and expiry so it cannot authorize a different identity or action.
- [ ] On successful relink, invalidate all existing organizer sessions and API tokens, consume any outstanding relink tokens, and record a safe audit/security event. Show a generic completion/error result that does not disclose account existence to unauthenticated callers.
- [ ] Add an operator CLI recovery command for solo, SSO-only deployments without SMTP. It must require direct host/operator access, identify the organizer and pending new subject explicitly, preview the exact account change, require confirmation, and invalidate sessions/API tokens just like the email flow. It must never accept a subject solely from an unverified browser request.
- [ ] Add tests for known subject success, unbound verified-email first linking, conflicting subject recovery-required behavior, wrong/expired/replayed relink tokens, subject/purpose binding, successful mailbox relink, session/token invalidation, operator CLI recovery, unverified email rejection, provider email change for the already-bound subject, invite provisioning, and signup-open/closed behavior.
- [ ] **Acceptance:** a different subject can never authenticate as an already-bound organizer through email equality alone; mailbox-confirmed or operator-confirmed recovery can deliberately replace the binding; legitimate existing bindings and the approved first-link flow continue to work.
- [ ] Re-run finding verification against `server/src/routes/auth.ts:63-77,398-415` and `server/src/services/oidc.ts:84-96` before marking complete.
