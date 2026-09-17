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

- **PI-123–128** — security findings from the 2026-09-17 audit: malformed realtime acknowledgments, SSO invite verification/account linking, withdrawal snapshot privacy, public-lock grant revocation, and password-change session revocation. All open; details and suggested fixes below.
- **PI-129–133** — functional findings from the same audit: IPv6 truncation, partial CUSTOM pod updates, player public-lock status, realtime recovery after lock changes, and foil-only card edits. All open; details below.
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

## Security and bug backlog (from the 2026-09-17 code audit)

All eleven items below are **open, not implemented**. Reviewed revision: `dee64d8b3a254d12440c6bb34f2def17ae648825`; security scan ID: `7169d6c8-b7ff-4951-a628-121abddf4249`. This was a partial source audit, not a complete assurance review. Targeted harnesses reproduced PI-123, PI-124, PI-126, PI-127, PI-129, and PI-130 using current source with mocked dependencies; the remaining items were identified by source inspection. No live service was exercised. Thirty-six existing tests passed; missing local dependencies blocked lint and loading the realtime test suite. Full integration testing and a dependency advisory scan remain outstanding.

**Suggested order:** fix PI-123 first (P1/high); then PI-124–127 (P2/medium security), coordinating PI-127 with PI-132 so revocation and reconnect behavior agree. Follow with PI-128 (P3/low security) and PI-129–133 (P2 functional priorities). Pair PI-124/125 for account-linking regression coverage and PI-127/131/132 for public-access coverage. These are implementation suggestions; check the current source before applying them. Restore dependencies from the lockfile in the implementation environment before running required checks; keep any dependency upgrades separate.

### PI-123 — Reject malformed Socket.IO acknowledgment arguments (P1 / high security)

**Problem:** `server/src/realtime.ts`, the `join` listener, accepts an unchecked second argument. Optional calling (`ack?.(...)`) does not establish that it is a function. A malformed argument throws in both the success path and the catch block, leaving an unhandled async rejection. An anonymous client can reach this even with an invalid room. The shared HTTP/realtime process can terminate under the deployed Node default rejection behavior; process termination itself was not exercised in the audit.

**Suggested fix:** treat the acknowledgment argument as untrusted at runtime and invoke it only when `typeof ack === "function"`. Keep failure reporting from throwing a second exception and ensure the event listener's asynchronous work has a final rejection handler. Preserve room authorization and legitimate optional acknowledgments.

- [ ] Implement runtime acknowledgment validation and contained error handling.
- [ ] Add a real Socket.IO regression test for object/string/number acknowledgments, omitted acknowledgments, valid callbacks, invalid rooms, and authorizer failures. Verify no unhandled rejection, unauthorized room join, or process exit; a subsequent valid request must still succeed.
- [ ] Verify normal room updates against the production Node/container configuration before closing.

### PI-124 — Require verified SSO email before consuming any invite (P2 / medium security)

**Problem:** `server/src/services/sso.ts`, the existing `oidcSubject` branch, calls `consumePendingInvite` before the later `emailVerified` check. A known SSO subject proves account identity, but does not prove ownership of its current email. Exploitation requires an already-linked account, a pending target invitation, and an identity provider that allows an attacker-controlled unverified email change; the result is organizer membership in the invited organization.

**Suggested fix:** gate invite consumption on a present, verified email in every account-resolution branch, preferably at the shared consumption boundary. Keep authentication by an already-linked subject separate from permission to claim an email-addressed invitation; an unverified email must not create new membership.

- [ ] Centralize the verified-email requirement and retain existing invite validity/consumption rules.
- [ ] Test existing/new subjects with verified, unverified, missing-email, and missing-verification claims. Unverified cases must leave the invitation and membership unchanged; a verified intended recipient must succeed.
- [ ] Verify with the configured provider that ordinary returning-user login still works without silently granting an invitation.

### PI-125 — Prevent SSO linking from retaining preregistered attacker credentials (P2 / medium security)

**Problem:** local signup in `server/src/routes/auth.ts` accepts an unverified email and creates a usable password/session. The `byEmail` branch in `server/src/services/sso.ts` later links a verified SSO identity to that account without replacing its password or invalidating sessions. With public signup and local login enabled, an attacker can preregister an unused victim email, then retain access after the victim signs in through SSO and receives organization membership.

**Suggested fix:** represent local email verification explicitly and prevent unverified local accounts from becoming trusted SSO-linked accounts solely through an email match. For an existing unverified match, use a deliberate recovery/linking flow that proves mailbox ownership, removes the untrusted password, revokes sessions and API tokens, and only then attaches the SSO subject and consumes invites. Define a migration policy for existing accounts whose ownership was never verified; do not mark all historical addresses verified automatically. Preserve legitimate verified account linking and avoid silently merging organization data.

- [ ] Specify and implement verification state, safe linking/recovery, and the existing-account migration policy.
- [ ] Reproduce attacker signup → victim verified SSO login with a pending invite. After secure recovery, the old password, old cookie, and preexisting API tokens must fail; the victim must retain intended access.
- [ ] Cover already-linked subjects, verified local accounts, concurrent linking attempts, and disabled-signup/local-login configurations. Check memberships are neither duplicated nor silently reassigned.

### PI-126 — Exclude withdrawal snapshots from public responses and anonymize retained copies (P2 / medium security)

**Problem:** `server/src/services/onDemandWithdrawal.ts` stores original player IDs/names in `Round.onDemandWithdrawals`. The public rounds route in `server/src/routes/public.ts` returns full round records through a helper that only removes unrevealed matches. Visitors authorized for the public page can therefore read original names despite name hiding, unrevealed pairings, or later player anonymization.

**Suggested fix:** construct an explicit public round response with only client-required fields, excluding internal withdrawal/undo snapshots regardless of reveal state. Extend player anonymization to scrub personal data from existing snapshots. Preserve organizer undo behavior without restoring erased identity data; handle historical JSON shapes deliberately.

- [ ] Add a public response allowlist and audit other serializers of the same snapshot field.
- [ ] Scrub retained snapshot names/identifiers as required by the anonymization contract, including existing data when anonymization has already occurred; plan safe cleanup for records that cannot be matched confidently.
- [ ] Test public responses before/after reveal, with hidden names, after on-demand withdrawal, and after anonymization. Internal snapshots and erased names must never appear. Verify organizer undo remains functional and cannot resurrect erased identity data.

### PI-127 — Invalidate public unlock grants when the lock changes (P2 / medium security)

**Problem:** `server/src/routes/public.ts` stores unlocked organization IDs in the session. HTTP and realtime access checks do not bind these grants to the current password. A previously unlocked visitor retains access after password rotation or disable/re-enable while their cookie is still valid.

**Suggested fix:** persist an organization lock generation/version, update it atomically with relevant lock changes, and store the generation with each session grant. Require matching generations in both HTTP and realtime authorization; legacy grants without a generation should require a fresh unlock. Reauthorize active sockets when access changes. Retain separately validated organizer/player access and coordinate reconnect behavior with PI-132.

- [ ] Implement the schema migration, versioned grants, and shared HTTP/realtime validation.
- [ ] Test two browsers: unlock both, rotate the password, then confirm old grants fail for both HTTP reads and room joins until a fresh unlock. Also cover disable/re-enable, legacy cookies, and organization isolation.
- [ ] Verify already-connected unauthorized sockets stop receiving protected updates immediately; authorized organizer/player sessions continue through their own access rules.

### PI-128 — Revoke old organizer sessions on password change (P3 / low security)

**Problem:** the password-change route in `server/src/routes/settings.ts` updates `passwordHash` only. Middleware checks `authVersion`, which stays unchanged, so an attacker already holding an organizer session remains authorized after a password change.

**Suggested fix:** atomically increment `authVersion` with the password update. If the initiating browser should remain logged in, refresh only its session to the new version after success. Apply revocation to realtime authorization/connections too. Explicitly define whether password changes also revoke API tokens, and provide a clear recovery action if token revocation is separate; coordinate with PI-125.

- [ ] Implement atomic password/session-version changes and the initiating-session behavior.
- [ ] Test two active sessions: after one changes the password, the other's protected requests and socket access must fail. Verify the old password fails and the new password works.
- [ ] Verify failed password changes leave the version unchanged and document/test the API-token recovery policy.

### PI-129 — Correctly truncate compressed IPv6 addresses (P2 / functional)

**Problem:** `server/src/services/tracking.ts` splits on colons and removes empty segments before taking a prefix. This loses the zero groups represented by `::`: `2001:db8::1234:5678` becomes `2001:db8:1234::`, retaining misplaced host bits instead of the intended `/48` prefix `2001:db8::`.

**Suggested fix:** parse and expand IPv6 correctly, mask the first 48 bits, then format the normalized network address. Reuse a suitable existing parser if available. Keep IPv4 behavior stable and define handling of IPv4-mapped IPv6, invalid input, and zone identifiers before storage; never fall back to storing an untruncated raw address.

- [ ] Replace segment filtering with address-aware normalization and masking.
- [ ] Cover compressed/uncompressed equivalents, compression at either end, loopback, all-zero addresses, mapped addresses, invalid input, and the reported example. Equivalent addresses must produce the same prefix and host bits must not survive.
- [ ] Check whether retained analytics prefixes require cleanup; corrupted historical prefixes cannot reliably reconstruct the original network.

### PI-130 — Validate partial CUSTOM pod updates against merged state (P2 / functional)

**Problem:** the pod PATCH route in `server/src/routes/pods.ts` passes only submitted fields to `constructedFormatError` while falling back to the stored outer format. Valid edits such as renaming an existing custom constructed format can fail because other required values already stored on the pod are omitted from the patch.

**Suggested fix:** build the proposed state by combining existing format fields with explicitly supplied patch values, then validate that state before writing. Preserve the distinction between an omitted field and an explicit null/clear, and apply the same normalization to validation and persistence.

- [ ] Validate the effective `format`, `constructedFormat`, and `constructedFormatCustom` together.
- [ ] Test custom-name-only changes, switching to CUSTOM with an existing name, unrelated-field patches, explicit clears, and transitions away from CUSTOM. Valid partial edits must succeed; genuinely incomplete resulting states must still fail.

### PI-131 — Report public unlock status consistently for authenticated players (P2 / functional)

**Problem:** public-route authorization in `server/src/routes/public.ts` permits a valid player session for its own organization, but the status response computes `unlocked` only from the lock/password grant. `client/src/components/PublicLayout.tsx` consequently shows the password screen to players whom the server already permits.

**Suggested fix:** derive status and protected-route access from a shared access decision that includes valid same-organization player sessions and existing organizer/password-grant rules. Keep session validity checks and organization scoping intact; coordinate the password-grant branch with PI-127.

- [ ] Share the access decision between status and route authorization.
- [ ] Test anonymous locked/unlocked visitors, valid same-org players, other-org players, expired/revoked player sessions, and organizers. Status must agree with actual access.
- [ ] Browser-verify a player opening a protected public pod from the portal without entering the public password, and verify logout restores the lock screen.

### PI-132 — Restore realtime updates after public-lock changes (P2 / functional)

**Problem:** `server/src/realtime.ts` calls `disconnectSockets(true)` when the public lock changes. Socket.IO does not automatically reconnect after an explicit server disconnect, and `client/src/lib/socket.ts` / `client/src/features/pods/usePodRealtime.ts` do not recover from it. Open pages stop receiving updates until reloaded.

**Suggested fix:** coordinate a lock-change/reconnect flow with PI-127. Reconnect when appropriate, refresh the server access decision, rejoin authorized rooms, and refetch current page data to cover missed events. Denied clients must enter the unlock flow without repeatedly reconnecting or receiving protected events. Prefer disconnecting only affected organization connections if practical.

- [ ] Implement bounded reconnect/rejoin behavior with authorization checks and recovery of missed state.
- [ ] In two browsers, change the lock while pages are open. Authorized users must resume updates without a reload; revoked visitors must stop receiving updates and be prompted to unlock.
- [ ] Cover rotation, disable/re-enable, ordinary transport interruption, repeated lock changes, and unrelated organizations. Verify no retry loop or duplicate event handlers.

### PI-133 — Preserve card printing during foil-only edits (P2 / functional)

**Problem:** `server/src/routes/cardPulls.ts` resolves the card using `body.data.setCode` without falling back to the stored printing when that field is omitted. A `{ foil: true }` patch can therefore select Scryfall's default printing and overwrite the saved set, ID, image, and price.

**Suggested fix:** when the card identity is unchanged, resolve foil availability/pricing against the saved exact `scryfallId` where possible, retaining printing metadata. Use the existing set as a constrained fallback for legacy records, with explicit handling if the printing cannot be resolved. Only select a different printing when the request actually changes card identity; keep any price-refresh behavior deliberate.

- [ ] Separate identity changes from finish-only edits and preserve saved printing metadata.
- [ ] Mock multiple printings of the same name and verify a foil-only edit keeps the original printing/set/image while selecting its appropriate finish price. Cover missing foil price, legacy records without an ID, and explicit card/set changes.
- [ ] Browser-verify foil toggling on a non-default printing and confirm the saved card remains the selected printing.

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
