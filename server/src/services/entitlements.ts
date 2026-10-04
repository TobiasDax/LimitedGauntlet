// HI-1 — the single boundary every hosted-instance entitlement check passes
// through.
//
// The invariant this file exists to protect: **a self-hosted deployment is the
// complete app.** No capability is ever missing from it, and no self-hoster is
// ever asked to pay for anything. That is guaranteed structurally rather than
// by promise — `can()` returns true unconditionally unless the deployment
// opted into enforcement via HOSTED_ENTITLEMENTS, which nothing in this repo's
// compose file, .env.example or self-hosting docs ever sets.
//
// Note the short-circuit happens *before* the tier is read. The entitlement
// columns added in HI-2 therefore sit inert on a self-hosted database: a row
// saying `entitlementTier = FREE` restricts nothing, because no code path
// reaches the lookup. Keep it that way — any future check must start here, not
// read `organization.entitlementTier` directly.
//
// Quantitative limits (the free tier's lifetime tournament/pod caps, the
// 7-day window on unsubscribed tiers, retention expiry) are *not* here: they
// need the ledger and live counts, and land in HI-3. This file answers only
// the static question "does this tier have this capability at all".
import { config } from "../config.js";
import type { EntitlementTier } from "../db.js";

export const CAPABILITIES = [
  // Per-org outbound webhooks (PI-50).
  "webhooks",
  // Anything that sends mail on the org's behalf: co-organizer invites,
  // player invites, GDPR notices. Platform SMTP still serves account-level
  // flows regardless of tier — see services/mailer.ts.
  "email",
  // Organizer-facing bulk export of the whole org (services/orgExport.ts).
  // Deliberately distinct from a *player's* own GDPR data export, which is a
  // data-subject right and is never gated on any tier.
  "export.bulk",
  // Spreadsheet export of a tournament (services/tournamentSpreadsheet.ts).
  "export.excel",
  // Programmatic access: API tokens and the MCP server that uses them.
  "apiTokens",
  // Inviting additional organizers. Without it an org is single-TO.
  "organizer.invite",
  // Editing a tournament's start/end dates after they are first set.
  "tournament.editDates",
  // Running a tournament longer than the unsubscribed-tier window.
  "tournament.unlimitedDuration",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

// FREE and TOURNAMENT_PASS intentionally hold the same capabilities: buying a
// one-time pass changes *quantities* (unlimited pods inside the tournament it
// covers), never which features exist. Only a SERIES subscription unlocks
// capabilities, and it unlocks all of them — a subscribed org behaves exactly
// like a self-hosted instance.
const TIER_CAPABILITIES: Record<EntitlementTier, ReadonlySet<Capability>> = {
  FREE: new Set(),
  TOURNAMENT_PASS: new Set(),
  SERIES: new Set(CAPABILITIES),
};

export function isEntitlementEnforcementActive(): boolean {
  return config.hostedEntitlements.enforced;
}

export function can(tier: EntitlementTier, capability: Capability): boolean {
  if (!isEntitlementEnforcementActive()) return true;
  return TIER_CAPABILITIES[tier].has(capability);
}

// ---------------------------------------------------------------------------
// HI-3 — quantitative rules.
//
// Everything below is pure: it takes an already-loaded snapshot and a clock,
// and never touches the database. The DB-reading wrappers that feed it live in
// entitlementAccess.ts. Splitting it this way keeps the rules themselves
// exhaustively testable without fixtures, which matters because these are the
// decisions that decide whether someone can see their own tournament.
// ---------------------------------------------------------------------------

/** Longest tournament an org without an active subscription may run. */
export const UNSUBSCRIBED_MAX_TOURNAMENT_DAYS = 7;
/** How long data stays readable after an unsubscribed org's last tournament ends. */
export const UNSUBSCRIBED_RETENTION_MONTHS = 1;
/** Pods allowed in a tournament covered by the lifetime free slot. */
export const FREE_TIER_POD_LIMIT = 1;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type EntitlementState = {
  tier: EntitlementTier;
  subscriptionExpiresAt: Date | null;
  cumulativePaidMonths: number;
  retentionOverrideUntil: Date | null;
  freeTournamentUsed: boolean;
};

export function addMonths(from: Date, months: number): Date {
  const result = new Date(from);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * A null `subscriptionExpiresAt` on a SERIES org means a perpetual grant that
 * never lapses — the shape an operator comp takes (see entitlementsAdmin.ts).
 * It must never be read as "already expired".
 */
export function isSubscriptionActive(state: EntitlementState, now: Date = new Date()): boolean {
  if (state.tier !== "SERIES") return false;
  return state.subscriptionExpiresAt === null || state.subscriptionExpiresAt > now;
}

/**
 * The tier actually in force right now. A SERIES subscription that has lapsed
 * stops granting paid capabilities and falls back to FREE; whether its data is
 * still readable is a separate question answered by `isDataAccessible`.
 */
export function effectiveTier(state: EntitlementState, now: Date = new Date()): EntitlementTier {
  if (isSubscriptionActive(state, now)) return "SERIES";
  return state.tier === "SERIES" ? "FREE" : state.tier;
}

/** Capability check against a loaded org snapshot rather than a bare tier. */
export function allows(state: EntitlementState, capability: Capability, now: Date = new Date()): boolean {
  if (!isEntitlementEnforcementActive()) return true;
  return can(effectiveTier(state, now), capability);
}

/**
 * When an org's data stops being readable, or null for "no expiry".
 *
 * One org-wide deadline, never staggered per tournament: an org's content
 * becomes inaccessible all at once. A subscribed org has no deadline at all.
 * A lapsed subscription keeps its data for as many months as were ever paid,
 * counted from the lapse — cumulative and uncapped by design. An org that
 * never subscribed keeps its data for a month past its last tournament.
 *
 * An operator retention grant always wins when it reaches further out.
 */
export function dataAccessibleUntil(
  state: EntitlementState,
  latestTournamentEnd: Date | null,
  now: Date = new Date(),
): Date | null {
  if (isSubscriptionActive(state, now)) return null;

  let deadline: Date | null = null;
  if (state.tier === "SERIES" && state.subscriptionExpiresAt) {
    deadline = addMonths(state.subscriptionExpiresAt, state.cumulativePaidMonths);
  } else if (latestTournamentEnd) {
    deadline = addMonths(latestTournamentEnd, UNSUBSCRIBED_RETENTION_MONTHS);
  }
  // An org with no tournaments has never started a retention clock, so there
  // is nothing to expire — it holds no content to lock away.

  if (state.retentionOverrideUntil && (deadline === null || state.retentionOverrideUntil > deadline)) {
    return state.retentionOverrideUntil;
  }
  return deadline;
}

/**
 * Inaccessible is not deleted: rows are retained so an upgrade restores
 * everything (ROADMAP-HOSTED.md rule 7). This only gates reads.
 */
export function isDataAccessible(
  state: EntitlementState,
  latestTournamentEnd: Date | null,
  now: Date = new Date(),
): boolean {
  if (!isEntitlementEnforcementActive()) return true;
  const until = dataAccessibleUntil(state, latestTournamentEnd, now);
  return until === null || until > now;
}

/** Longest permitted tournament span, or null when unrestricted. */
export function maxTournamentDays(state: EntitlementState, now: Date = new Date()): number | null {
  if (!isEntitlementEnforcementActive()) return null;
  return isSubscriptionActive(state, now) ? null : UNSUBSCRIBED_MAX_TOURNAMENT_DAYS;
}

/**
 * Whether a tournament's span fits the tier's window. Measured as elapsed time
 * between the two dates, so a seven-day limit permits exactly seven times
 * twenty-four hours.
 */
export function isWithinDurationLimit(
  state: EntitlementState,
  startDate: Date,
  endDate: Date,
  now: Date = new Date(),
): boolean {
  const limitDays = maxTournamentDays(state, now);
  if (limitDays === null) return true;
  return endDate.getTime() - startDate.getTime() <= limitDays * MS_PER_DAY;
}

/**
 * ROADMAP-HOSTED.md rule 4 — the play window. A free/pass tournament's rounds
 * may only be started or finished between its start date and the end of its
 * end-date day; a hard close, not before and not after, including mid-round. A
 * subscribed org (or self-hosted) has no window.
 *
 * The end is inclusive of the whole end-date day: dates are collected
 * day-granular (an HTML date input, stored as that day's UTC midnight), and a
 * real event runs through its final day — so the window closes 24h after the
 * stored `endDate`, not at the instant of it (which would make the last day
 * unplayable). `startDate` is already that day's start, so the open side needs
 * no adjustment.
 */
export function isWithinPlayWindow(
  state: EntitlementState,
  startDate: Date,
  endDate: Date,
  now: Date = new Date(),
): boolean {
  if (!isEntitlementEnforcementActive()) return true;
  if (isSubscriptionActive(state, now)) return true;
  const windowEndExclusive = endDate.getTime() + MS_PER_DAY;
  return now.getTime() >= startDate.getTime() && now.getTime() < windowEndExclusive;
}
