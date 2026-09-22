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
