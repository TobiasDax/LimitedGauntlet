# Hosted Instance Roadmap

**Branch-scoped working document for `feat/hosted-entitlements`.** Everything here concerns the *hosted* deployment only. The main [`ROADMAP.md`](ROADMAP.md) tracks the app itself; this file tracks the optional, deployment-gated entitlement layer that only the hosted instance switches on.

Items use an `HI-` prefix (hosted instance) deliberately, so they never collide with `main`'s `PI-` sequence while both tracks move in parallel.

> Commercial details — pricing, payment-processor choice, fee structure, business rationale — are intentionally **not** in this repo. This file specifies behaviour only.

## The non-negotiable

**The self-hosted app is, and stays, the full app.** No feature is ever missing from a self-hosted deployment, and no self-hoster is ever asked to pay for anything.

The mechanism that guarantees this structurally, rather than by promise:

```
function can(org, capability) {
  if (!isBillingEnforced()) return true;   // default everywhere
  ...tier logic only ever runs past this line...
}
```

`isBillingEnforced()` reads a single deployment-level env var that is **unset by default** and is never set by `docker-compose.yml`, `.env.example`, or any self-hosting instruction in this repo. Only the hosted deployment's own private config sets it. Consequences to preserve in every change:

- Entitlement schema fields ship to every deployment but stay inert — the flag short-circuits **before** `tier` is ever read, so a self-hosted DB row saying `tier = FREE` is meaningless and harmless.
- Every restriction below (date immutability, duration caps, mandatory dates, capability gating) applies *only* when the flag is on.
- Support/contact links shown alongside hosted restrictions are config-driven too — a self-hosted instance must never surface the hosted operator's support address.

## Tiers

| | `FREE` | `TOURNAMENT_PASS` | `SERIES` |
|---|---|---|---|
| Tournaments | 1 (lifetime cap) | +1 per pass purchased | Unlimited while active |
| Pods | 1 (lifetime cap) | Unlimited within the tournament | Unlimited |
| Tournament duration | Max 7 days | Max 7 days | Unrestricted |
| Dates | Mandatory at creation, immutable | Mandatory, immutable | Optional, editable |
| Data retention | 1 month after tournament end | 1 month after tournament end | Cumulative paid months after lapse |
| Co-organizers | 1 TO only | 1 TO only | Unlimited |
| Webhooks / SMTP / bulk + Excel export | Disabled | Disabled | Enabled |

`SERIES` behaves exactly like a self-hosted instance for as long as the subscription is active.

## Product rules

1. **Free lifetime cap.** One tournament, one pod, ever — not "one at a time."
2. **Registration is decoupled from org creation.** Signing up creates an account and nothing else — it never burns the free tournament slot. An account with no org can reach its profile/settings, an info page, and the upgrade flow, and can create its one free org from there. *Creating the free org* is the combined step that also creates its first tournament with its dates locked in, and that is the moment the slot is spent.

   Chosen over showing warning text before registration: needing a warning to excuse a surprise is weaker than removing the surprise. It is also the cheaper change — org-less accounts already work end to end (`resolveLoginOrg` returns null, `requireAuth` answers `org_selection_required`, `ProtectedRoute` routes to `/organizations`, and `OrganizationsPage` exists). Only signup currently bundles the two.

   Note `Tournament.startDate`/`endDate` are already non-nullable, so "dates are mandatory" is existing behaviour on every tier — the free-tier additions are the combined org+tournament step and the duration cap, not the dates themselves.
3. **Pass application is a user choice.** Buying a pass presents two options: (a) upgrade the existing free tournament to paid and get the free slot back, or (b) keep the free tournament and unlock an additional paid one. Either path leaves the org with one free + one paid tournament. This is why pass entitlements are *tournament-scoped* rather than an org-level tier.
4. **The 7-day window is start-date to end-date.** Pods may only be started *or finished* inside it. Hard close — a pod cannot start or finish outside the window, including mid-round.
5. **Date immutability** applies to `FREE` and `TOURNAMENT_PASS` only. The UI must clearly explain the restriction and link to a support contact for manual changes, which the operator fulfils via the admin CLI. `SERIES` dates stay freely editable.
6. **Retention is generous and cumulative.** `SERIES` retention = total months ever paid, across all subscription periods, counted from subscription lapse. Uncapped. Expiry is org-wide — everything becomes inaccessible together, never staggered per tournament.
7. **Inaccessible ≠ deleted.** Rows are retained; access is denied. Upgrading restores everything.
8. **One free org per account.** Registration is Discord-only; a Discord identity that already owns a `FREE` org cannot create a second one. Paid orgs are unrestricted. Multi-account circumvention is an accepted ceiling, not a problem to solve.
9. **Existing orgs are grandfathered** at rollout.
10. **GDPR rights are never tier-gated.** Only organizer-facing *bulk* and *Excel* export are gated. A player's right to access or export their own personal data is unaffected on every tier.

## Architecture

**Entitlements are split by scope.** A single `Organization.tier` enum cannot represent "one free tournament + one paid tournament in the same org" (rule 3), so:

- **`Organization`** — `SERIES` subscription state (active-until, cumulative paid months, manual retention override), plus a `freeTournamentUsed` flag for the lifetime free slot.
- **`Tournament`** — which entitlement covers it: the free slot, or a specific pass purchase.
- **`BillingEvent`** — append-only ledger: amount, product granted, period start/end, processor event id (unique, for webhook-retry idempotency), and the tournament a pass was applied to. The ledger is the source of truth for cumulative paid months; the fields on `Organization` are a derived cache recomputed when an event lands.

Applying a pass to the existing free tournament simply flips `freeTournamentUsed` back to `false`.

**Data inaccessibility is computed at read time**, not a cron-mutated flag — the same shape as the existing `publicLockVersion` check (PI-127) and `isPubliclyAccessible()` (PI-131): one shared decision function reused by every read path (organizer routes, public routes, realtime authorization, MCP tools). No scheduled job, no missed-run risk.

**All logic lives in the service layer.** This repo tests services against a real DB and leaves `routes/*.ts` code-reviewed only. Entitlement rules therefore belong in a service module with routes as thin guard calls — logic that leaks into a route handler is logic this project's conventions will not cover with tests.

## Work items

### HI-1 — Config switch and entitlements service skeleton ✅ (code-complete 2026-09-22)
The self-hosted guarantee, before anything can depend on it.
- [x] `HOSTED_ENTITLEMENTS` flag in `server/src/config.ts`; false unless explicitly set; referenced nowhere in compose files, `.env.example` or self-hosting docs.
- [x] `server/src/services/entitlements.ts` — capability list, tier→capability matrix, and the `can()` boundary that short-circuits *before* reading any tier.
- [x] `entitlements.test.ts` (pure, no DB): every capability on every tier returns `true` with the flag off — the regression test protecting self-hosters — plus the enforced-mode matrix and a `FREE`/`TOURNAMENT_PASS` equivalence check. 6/6 passing.

Capability gating only. Quantitative limits (lifetime caps, the 7-day window, retention expiry) need the ledger and live counts and belong to HI-3.

### HI-2 — Schema and migration ✅ (code-complete 2026-09-22)
- [x] `Organization`: `entitlementTier`, `subscriptionExpiresAt`, `cumulativePaidMonths`, `retentionOverrideUntil`, `freeTournamentUsed`.
- [x] `Tournament`: `coveringEntitlement` (null = covered by an active subscription, or enforcement off).
- [x] `BillingEvent` ledger + `BillingEventSource` enum; `processorEventId` unique and nullable so operator grants share the same audit trail as processor payments.
- [x] Migration `20260922100000_hosted_entitlements` generated offline via `prisma migrate diff --from-schema/--to-schema`; `prisma validate` clean; client regenerated.
- [x] Applied against a real database and verified with the CI drift check (`prisma migrate diff --from-migrations --to-schema --exit-code`): **no difference detected**.

Defaults leave self-hosted rows inert: a row reading `entitlementTier = FREE` restricts nothing, because `can()` never reaches the lookup with the flag off.

### HI-3 — Entitlement rules and tests ✅ (code-complete 2026-09-22)
- [x] Effective-tier resolution, with a perpetual grant (null expiry) reading as never lapsing.
- [x] Cumulative-paid-months retention and a single org-wide expiry.
- [x] `isOrgDataAccessible()` in `entitlementAccess.ts`, plus `claimTournamentCoverage` / `applyPassToTournament` for rule 3.
- [x] Caps: free lifetime tournament/pod, pass-scoped tournament, 7-day duration.
- [x] 20 pure rule tests + 20 real-DB tests covering those boundaries. **Creating a tournament spends the free slot before a pass**, so buying one never silently burns it.

### HI-4 — Enforcement at call sites ✅ (code-complete 2026-09-22)
Thin guard calls only; no logic here.
- [x] Tournament creation (limit + span), pod creation (free-tier cap).
- [x] Co-organizer invite (1 TO on free/pass).
- [x] Webhook *creation*, player-invite email, bulk export, Excel export, API token *creation*. Listing and deleting stay open so a downgrade never strands something the org can't see or remove; the invite still returns a shareable link when its email is gated.
- [x] Organizer route groups via a shared `requireOrgDataAccessible` preHandler, and the public routes *ahead of* the password prompt — offering to unlock expired content would be a lie.
- [x] Realtime authorization gates room joins on the same check, ahead of every access branch — an unlocked org would otherwise keep streaming updates for content the HTTP routes already refuse.
- [x] MCP needs no separate gate: it is an HTTP client, and `requireAuth` falls back to bearer auth, so its calls pass through the same preHandler.
- [x] GDPR paths confirmed ungated: player data export and the removal-request notice are untouched.

### HI-5 — Date immutability and duration cap ✅ (code-complete 2026-09-22)
- [x] Date edits rejected on `FREE`/`TOURNAMENT_PASS` (402 `dates_locked`).
- [x] 7-day maximum span enforced on create and on any date-changing update.
- [ ] Pod start/finish window enforcement, including the mid-round hard close.

### HI-6 — Account/org decoupling ◐ (one-free-org rule done; decoupling pending)
- [ ] Stop signup creating an org, so registration lands in the existing org-less state.
- [ ] Combined org + tournament creation on the org-creation step (not signup), spending the free slot there.
- [ ] Once signup no longer creates an org, drop the signup-route exemption below — every org creation then flows through the one guarded route.
- [x] One-free-org-per-account check (`canCreateFreeOrganization`), wired into the multi-org creation route. The two signup routes are deliberately untouched: a brand-new account's first org is legitimately free. Paid orgs are unrestricted.

### HI-7 — Payment integration ⛔ (blocked on processor account setup)
- [ ] Checkout initiation route passing the org id as processor metadata.
- [ ] Signed webhook receiver: one-time purchase and subscription lifecycle events → ledger write → derived-state recompute.
- [ ] Idempotency on processor event id; verify replayed deliveries are no-ops.
- [ ] Pass-application choice (rule 3) captured at or immediately after checkout.
- [ ] Secrets via `.env` on the hosted deployment only.

### HI-8 — Admin CLI ✅ (code-complete 2026-09-22, DB-backed tests not yet run)
Built early — it is the escape hatch if the webhook path misbehaves in production.
- [x] `services/entitlementsAdmin.ts` holds all the logic (per this repo's convention that services are tested and scripts/routes stay thin).
- [x] `grant-tier` — set any tier. `SERIES` without `--months` grants perpetually (the comp shape for friends/partners); with `--months` it extends from the current expiry when one is still in the future, so topping up early never loses paid time.
- [x] `extend-retention` — pushes the retention deadline out independently of what was paid, accumulating from an existing future override.
- [x] `set-dates` — the sanctioned override for the rule 5 date lock; deliberately does not apply the tier duration window, since honouring a support request is exactly the case that needs to exceed it.
- [x] `show` — current entitlement state for an org.
- [x] Every grant writes a `BillingEvent` with source `OPERATOR`, so goodwill and payments share one audit trail.
- [x] `scripts/admin-entitlements.ts` follows the PI-49 operator-CLI pattern: preview the exact change, require a typed `yes` unless `--yes`, no HTTP route.
- [x] `entitlementsAdmin.test.ts` — 17 real-DB cases covering perpetual vs. fixed-period grants, extend-from-future-expiry, lapsed restart, downgrade, month validation, retention accumulation, date changes, and the over-long span the override is allowed to make. **All passing**; full server suite 266/266 (26/26 files) with these added.

**Perpetual-grant semantics to carry into HI-3**: on a `SERIES` org, `subscriptionExpiresAt = null` means *never lapses*, not *already lapsed*. The activity check must read it that way.

### HI-9 — Client UI ◐ (landing page done; rest pending)
- [ ] Tier indicator in org settings.
- [ ] Gated controls show an upsell prompt rather than vanishing silently.
- [ ] Pricing/upgrade page.
- [ ] Date-immutability explanation plus config-driven support contact link.
- [ ] Subscription management links out to the processor's hosted customer portal.
- [x] `GET /api/app-config` now exposes `hostedEntitlements` (and `supportEmail`, null unless hosted), so the client can tell the two deployments apart. Everything tier-related hangs off that one flag.
- [x] Org-less landing content on `OrganizationsPage`: a self-hosted install is told its organization has everything and nothing to pay for; tiers and upgrade copy render only on the hosted branch. Deliberately no prices in the repo yet — they arrive with HI-7.
- [ ] Browser-verify both branches (self-hosted default, and with `HOSTED_ENTITLEMENTS=true`).

### HI-10 — Grandfathering and rollout ✅ (code-complete 2026-09-22, rehearsal pending)
- [x] `admin-entitlements.js grandfather` — previews every affected org, then applies *exactly that list* so nothing created mid-confirmation is swept in. Safe to re-run; skips orgs already on SERIES.
- [ ] Rehearse on a copy of hosted data before touching production.
- [ ] Reconciliation backstop (periodic re-poll of processor subscription state) — optional, post-v1.

## Branch conventions

- Long-lived branch; merge `main` in periodically to avoid drift.
- CI (PI-92) builds the image and runs the boot smoke test on PRs — keep it green.
- No tagging or release from this branch; the release pipeline runs after merge only.
- Commit messages and PR descriptions stay technical. No pricing or commercial rationale in repo history.
- Same verification posture as `main`: the dev sandbox cannot run the app, so items are typechecked and service-tested here, then browser-verified on a real deployment before being considered done.

## Next steps

Ordered by what blocks what. Everything below HI-7 can proceed in parallel.

### 1. Verify what already exists (no new code needed)

- [ ] **Browser-verify the landing page both ways.** Default (self-hosted) should describe an unlimited organization and show no tier, quota or price anywhere. Then set `HOSTED_ENTITLEMENTS=true` and confirm the free-tier and upgrade cards appear. This is the one place a mistake is publicly embarrassing — a self-hoster seeing a paywall.
- [ ] **Exercise the admin CLI against a real database**: `show`, `grant-tier` (with and without `--months`), `extend-retention`, `set-dates`, and `grandfather` in its preview-then-abort form.
- [ ] **Sanity-check enforcement end to end** on a scratch org with `HOSTED_ENTITLEMENTS=true`: create a tournament, try a second (402 `tournament_limit`), add a second pod (402 `pod_limit`), try editing dates (402 `dates_locked`), then `grant-tier … SERIES` and confirm all four now succeed.

### 2. Operator setup (blocks HI-7 — nothing here is a code change)

- [ ] Create the payment-processor account and store; define two products: a one-time pass, and a subscription with monthly and annual variants. Enable test mode.
- [ ] Record the API key and webhook signing secret in the hosted deployment's `.env` — never in this repo.
- [ ] Set `HOSTED_SUPPORT_EMAIL` on the hosted deployment (the contact shown beside locked dates; blank elsewhere).
- [ ] Decide the published prices and where they render. They are deliberately absent from this repo — the UI copy and the processor's product config both need them.

### 3. Remaining code

- [ ] **HI-6** — stop signup creating an org; move combined org + tournament creation onto the org-creation step; then drop the signup-route exemption in `canCreateFreeOrganization` so every org creation flows through one guarded path.
- [ ] **HI-7** — checkout initiation (org id as metadata), signed webhook receiver writing the ledger, the rule 3 pass-application choice, and optionally the reconciliation poll.
- [ ] **HI-9 (rest)** — tier badge in settings, upsell prompts on gated controls, a pricing page, the date-immutability note with its support link, and the customer-portal link.

### 4. Rollout, in this order

The order matters: grandfathering **must** precede enforcement, or every existing org is retroactively restricted the moment the flag flips.

1. [ ] Merge to `main` and deploy with `HOSTED_ENTITLEMENTS` **unset**. Everything stays inert; confirm nothing about the running app changed.
2. [ ] Run `admin-entitlements.js grandfather` against the hosted database. Read the preview list before confirming.
3. [ ] Spot-check with `admin-entitlements.js show <slug>` that existing orgs now read `SERIES` with `(perpetual)`.
4. [ ] Only then set `HOSTED_ENTITLEMENTS=true` and restart.
5. [ ] Re-verify a self-hosted image built from the same commit is still completely unrestricted.
