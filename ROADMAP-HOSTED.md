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
2. **Registration *and* org creation are decoupled from the first tournament.** Signing up creates an account and nothing else; creating an org creates only the org, leaving the free slot unspent. An account with no org can reach its profile/settings, an info page, and the upgrade flow, and can create its one free org from there. The free slot is spent later, when the first tournament is created via the normal `POST /api/tournaments` flow — which is where its dates lock in and the 7-day span cap applies. So an account is never forced to pick tournament dates just to get an account or an organization.

   Revised 2026-10-04: org creation no longer bundles the first tournament. The earlier combined step pre-spent the slot at org creation to lock dates up front; that forced a would-be subscriber to invent a throwaway date-locked tournament before they could even subscribe. Relocating the slot-spend to the (already fully entitlement-aware) tournament route keeps every guard — `canCreateTournament`, `orgAllowsTournamentSpan` (the cap), `claimTournamentCoverage` (the spend), and the date lock — just at tournament-creation time instead of org-creation time. Abuse posture unchanged; the route simply got simpler.

   Chosen over showing warning text before registration: needing a warning to excuse a surprise is weaker than removing the surprise. Org-less accounts already work end to end (`resolveLoginOrg` returns null, `requireAuth` answers `org_selection_required`, `ProtectedRoute` routes to `/organizations`, and `OrganizationsPage` exists).

   Note `Tournament.startDate`/`endDate` are already non-nullable, so "dates are mandatory" is existing behaviour on every tier — the free-tier addition is the duration cap, enforced where the tournament is created.
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
- [x] Pod start/finish window enforcement, including the mid-round hard close — `isWithinPlayWindow` (pure, tested) + `canAdvancePlay` (DB) gate round creation (auto + manual pairing) and round completion in `routes/rounds.ts`, returning 402 `window_closed`. The window is inclusive of the whole end-date day (dates are day-granular); SERIES and self-hosted are unrestricted.

### HI-6 — Account/org decoupling ✅ (code-complete 2026-09-29, browser-verify pending)
- [x] **Registration creates an account only.** Both `/api/auth/signup` (password) and `/api/auth/oidc/complete-registration` (SSO) now create a passwordless-or-password account with no org/membership and return org-less (`activeOrgId: null`); `ProtectedRoute` already routes that to the org chooser. Client signup + OIDC-setup forms dropped their org fields accordingly.
- [x] **Org creation is the sole guarded path** (`POST /api/auth/organizations`), now reached by first-org creation too. Decision 1 fix: the blunt `allowSignup` gate would have locked SSO users out of their first org (hosted runs `allowSignup` off) — replaced with "first org allowed for any authenticated identity; *additional* orgs still need `allowSignup`". The `canCreateFreeOrganization` (rule 8) check applies uniformly now; the old signup-route exemption is gone because signup no longer makes orgs.
- [x] **Combined org + first-tournament creation, free-tier only** (decision 3). When entitlements are enforced, creating the org also creates its one tournament (name + dates, ≤7-day span validated) in a transaction, then `claimTournamentCoverage` spends the free slot — the moment the free tournament is committed. When enforcement is off (self-hosted, decision 2), org creation stays a plain one-org step and tournaments are added separately as before. Client create-org form shows the tournament fields only when `appConfig.hostedEntitlements`.
- [x] One-free-org-per-account check (`canCreateFreeOrganization`) — done earlier, now on the uniform path.
- [ ] **Not browser-verified**: Tobias should confirm on a live hosted instance: password + SSO registration land on the org chooser; creating an org makes just the org (no tournament step, free slot unspent); creating the *first tournament* then locks its dates, rejects a >7-day span, and spends the free slot (a second tournament is then blocked, as is running a round outside the window); a self-hosted instance (entitlements off) is unrestricted; and an SSO user can create their first org with `ALLOW_SIGNUP` off.

### HI-7 — Payment integration ◐ (Layer A + B code-complete 2026-09-30; Stripe dashboard setup + live-verify pending)
**Processor decided: Stripe Managed Payments** — a Merchant-of-Record flag on standard Stripe Checkout (Stripe handles EU VAT/OSS). Integration facts live in the private monetization memory; the code split into two layers:

**Layer A — processor-agnostic billing application (`services/billing.ts`), done + tested:**
- [x] `recordPassPurchase` (unused TOURNAMENT_PASS ledger row = spendable capacity), `applySubscriptionPayment` (SERIES + expiry set to Stripe's paid-through date + banked months; initial and renewals same path), `recordSubscriptionCancellation` (recorded, not revoked — the paid period isn't cut off).
- [x] Idempotent on the unique `processorEventId`; ledger insert + org update share a transaction so a redelivered webhook rolls back rather than double-applying. 7 real-DB tests.

**Layer B — the Stripe adapter (`routes/billing.ts`), code-complete:**
- [x] `POST /api/billing/checkout` creates a hosted Checkout Session (`managed_payments: { enabled: true }`; `client_reference_id`/metadata carry the org id), returns the URL to redirect to. Pass = `mode: payment`; subscription = `mode: subscription`.
- [x] `POST /api/billing/webhook` verifies the signature (`constructEvent`) with a raw-body parser encapsulated to just that route, and routes events: the pass on `checkout.session.completed`/`async_payment_succeeded` (keyed on session id), subscriptions on `invoice.paid` (initial + renewals, keyed on invoice id, period/interval read off the retrieved subscription), cancellation on `customer.subscription.deleted`. Subscriptions deliberately handled *only* via `invoice.paid` so the first period isn't double-applied by the session event too.
- [x] Config (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, three price IDs) off by default; routes register only when `isStripeConfigured()`. `stripe` SDK added (also to root `package.json` per the PI-102 de-hoist rule). API version pinned to `2026-02-25.preview` (Managed Payments' `managed_payments[enabled]` is preview-gated; a stable version header rejects it).
- [ ] **Stripe dashboard setup (Tobias):** create the products/prices (€5 pass; monthly + annual subscription) with a Managed-Payments-eligible tax code; put the secret key, webhook signing secret, and the three price IDs into the hosted instance's `.env` + the override's `environment:` block (above). Register the webhook endpoint (`/api/billing/webhook`) in the Stripe dashboard / CLI.
- [x] **Sandbox-verified (2026-10-04):** a test-card pass purchase recorded an unused pass (org stays FREE); a subscription checkout set the org SERIES with the right expiry and `cumulativePaidMonths`; the accompanying non-subscription invoice was correctly ignored (no double-count); Managed Payments added VAT (MoR confirmed). Done end-to-end via the Settings "Plan & billing" buttons.
- [ ] **Still to verify (Tobias, sandbox):** a renewal (Stripe CLI test clock or `trigger invoice.paid`) extends the expiry, and a redelivered event doesn't double-apply.

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

### HI-9 — Client UI ◐ (plan+billing surface, checkout wiring, entitlement exposure, date-lock note, 402→upsell sweep done; browser-verify remains)
- [x] **Plan & billing section in org settings** — a "Plan & billing" section on the Settings page (replacing the earlier plain badge), shown only when entitlements are enforced (never on self-hosted). Shows the effective tier, a SERIES active-until date, any banked unused passes, and the upgrade rows. Reads from `/auth/me`.
- [x] **Entitlement state exposed to the client** (`/auth/me` returns `entitlement: { enforced, tier, canEditTournamentDates, subscriptionExpiresAt, unusedPasses }`, derived server-side so the UI never re-implements the rules — a lapsed subscription reads as FREE; `unusedPasses` is only counted when enforcement is on).
- [x] **Date-immutability explanation + config-driven support link** — the tournament edit form, when dates are locked (hosted, unsubscribed), shows the dates read-only with an explanation and a `mailto:` to `SUPPORT_EMAIL` (falls back to "contact the organizer" when unset), instead of date fields that 402 on save. The form also omits the date fields from the PATCH when locked, so it can't trip the server guard.
- [x] **Pricing/upgrade surface** — the "Plan & billing" section offers the pass + monthly + annual Series, each a button that starts hosted Stripe Checkout (`POST /api/billing/checkout` → redirect). Price figures are read live from Stripe via `GET /api/billing/prices`, so no amount is ever in the repo (only the price *ids*, via env); labelled "+ tax" since Stripe (MoR) adds indirect tax at checkout.
- [x] **Subscription management → link.com** — not a hosted customer-portal endpoint: Managed Payments routes subscriber self-service (cancel / update / payment method) through link.com automatically, so the SERIES view links there. No stored Stripe customer id or portal-session endpoint needed.
- [x] **General 402→upsell sweep on gated controls** — one global interceptor rather than per-site handling: the QueryClient's `MutationCache.onError` (`maybeShowUpsell`) turns any 402 `entitlement_required` into a single app-root upsell modal (`UpsellModal` + the `upsell.ts` store/copy), with a "See plans" button linking to Settings → Plan & billing. Copy is accurate to the matrix (tournament/pod limits → pass *or* Series; every capability → Series only), and it covers all eleven refusal reasons plus any future gated control automatically. `free_org_limit` (handled inline on the org form) and `data_expired` (a read, not a mutation) are skipped. The locked-dates dead-end still has its own inline explanation on the edit form.
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

## Deploying with entitlements on

`HOSTED_ENTITLEMENTS` is deliberately absent from `docker-compose.yml`,
`docker-compose.image.yml` and `.env.example` — that absence *is* the
self-hosted guarantee. Neither compose file uses `env_file:`, so a variable
only reaches the container when it is listed under `environment:`. Putting
`HOSTED_ENTITLEMENTS=true` in `.env` therefore does nothing on its own.

The hosted deployment injects it through its own (private, not in this repo)
`docker-compose.override.yml`, alongside the Stripe billing config (HI-7):

```yaml
services:
  app:
    environment:
      HOSTED_ENTITLEMENTS: ${HOSTED_ENTITLEMENTS:-}
      HOSTED_SUPPORT_EMAIL: ${HOSTED_SUPPORT_EMAIL:-}
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:-}
      STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET:-}
      STRIPE_PRICE_PASS: ${STRIPE_PRICE_PASS:-}
      STRIPE_PRICE_SUB_MONTHLY: ${STRIPE_PRICE_SUB_MONTHLY:-}
      STRIPE_PRICE_SUB_ANNUAL: ${STRIPE_PRICE_SUB_ANNUAL:-}
```

With that in place the values come from `.env` as usual. A self-hosted
deployment has no such override, so nothing about billing can switch on by
accident — which is the point. The billing routes also self-gate: they only
register when `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` are both set
(`isStripeConfigured`), so even the override does nothing until the keys are
filled in.

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

HI-6, HI-7 and HI-9 are code-complete (see those items above — org/tournament decoupled, Stripe checkout + webhook done and sandbox-verified, plan & billing UI + the global 402→upsell sweep done, subscriber management via link.com). What's left:

- [x] **Rule 3 pass-application choice** — a free org with a banked pass can apply it to its *existing* free tournament (unlocks unlimited pods there and returns the free slot) via `POST /api/tournaments/:id/apply-pass` (mapping `applyPassToTournament`) and a "Use a pass on this tournament" control on the tournament page, shown only when hosted, a pass is available, and the tournament is still free-covered (`coveringEntitlement === "FREE"`). The other half — a pass auto-covering the *next* tournament created — was already handled by `claimTournamentCoverage`. So both paths of the rule-3 choice now exist.
- [ ] **Reconciliation backstop** — optional, post-v1: periodically re-poll Stripe for subscription state as a safety net for missed webhooks.

### 4. Rollout, in this order

The order matters: grandfathering **must** precede enforcement, or every existing org is retroactively restricted the moment the flag flips.

1. [ ] Merge to `main` and deploy with `HOSTED_ENTITLEMENTS` **unset**. Everything stays inert; confirm nothing about the running app changed.
2. [ ] Run `admin-entitlements.js grandfather` against the hosted database. Read the preview list before confirming.
3. [ ] Spot-check with `admin-entitlements.js show <slug>` that existing orgs now read `SERIES` with `(perpetual)`.
4. [ ] Only then set `HOSTED_ENTITLEMENTS=true` and restart.
5. [ ] Re-verify a self-hosted image built from the same commit is still completely unrestricted.
