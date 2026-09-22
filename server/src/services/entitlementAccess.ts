// HI-3 — the database-reading half of the entitlement rules.
//
// entitlements.ts holds the pure decisions; this module loads what they need
// and exposes the handful of questions routes actually ask. Every entry point
// short-circuits when enforcement is off, so a self-hosted deployment does not
// even pay for the extra queries, let alone the restrictions.
//
// Tournament coverage, in one place: an org running a tournament without an
// active subscription consumes either an unused one-time pass or its lifetime
// free slot. An unused pass is a BillingEvent row with tier TOURNAMENT_PASS
// and no tournamentId yet — claiming it attaches it to the tournament, which
// is also what makes "how many passes are left" a ledger question rather than
// a counter that can drift.
import { prisma } from "../prisma.js";
import type { EntitlementTier } from "../db.js";
import {
  allows,
  type Capability,
  FREE_TIER_POD_LIMIT,
  type EntitlementState,
  isDataAccessible,
  isEntitlementEnforcementActive,
  isSubscriptionActive,
  isWithinDurationLimit,
  maxTournamentDays,
} from "./entitlements.js";

/** Error code routes return with HTTP 402 when a tier restriction bites. */
export const ENTITLEMENT_REQUIRED = "entitlement_required";

export async function loadEntitlementState(orgId: string): Promise<EntitlementState> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: {
      entitlementTier: true,
      subscriptionExpiresAt: true,
      cumulativePaidMonths: true,
      retentionOverrideUntil: true,
      freeTournamentUsed: true,
    },
  });

  return {
    tier: org.entitlementTier,
    subscriptionExpiresAt: org.subscriptionExpiresAt,
    cumulativePaidMonths: org.cumulativePaidMonths,
    retentionOverrideUntil: org.retentionOverrideUntil,
    freeTournamentUsed: org.freeTournamentUsed,
  };
}

async function latestTournamentEnd(orgId: string): Promise<Date | null> {
  const latest = await prisma.tournament.findFirst({
    where: { orgId },
    orderBy: { endDate: "desc" },
    select: { endDate: true },
  });
  return latest?.endDate ?? null;
}

/**
 * The shared read gate — the same shape as publicVisibility's single decision
 * function, so organizer routes, public routes, realtime authorization and the
 * MCP tools all answer this question identically instead of drifting.
 */
export async function isOrgDataAccessible(orgId: string, now: Date = new Date()): Promise<boolean> {
  if (!isEntitlementEnforcementActive()) return true;

  const [state, end] = await Promise.all([loadEntitlementState(orgId), latestTournamentEnd(orgId)]);
  return isDataAccessible(state, end, now);
}

/**
 * HI-6 / rule 8 — one free org per account. An account that already holds a
 * free-tier org cannot spin up another to dodge the lifetime cap; paid orgs
 * are unrestricted. Someone determined enough to make a second Discord account
 * still can, which is an accepted ceiling rather than a hole to plug.
 *
 * Membership is a fair proxy for ownership here: co-organizers are a
 * subscription capability, so a free org has exactly one member — the person
 * who created it.
 */
export async function canCreateFreeOrganization(accountId: string): Promise<boolean> {
  if (!isEntitlementEnforcementActive()) return true;

  const existingFree = await prisma.organization.count({
    where: { entitlementTier: "FREE", memberships: { some: { accountId } } },
  });
  return existingFree === 0;
}

/** Capability check for a route that has an orgId but no loaded state. */
export async function orgAllows(orgId: string, capability: Capability, now: Date = new Date()): Promise<boolean> {
  if (!isEntitlementEnforcementActive()) return true;
  return allows(await loadEntitlementState(orgId), capability, now);
}

/** Whether a proposed tournament span fits the org's tier window. */
export async function orgAllowsTournamentSpan(
  orgId: string,
  startDate: Date,
  endDate: Date,
  now: Date = new Date(),
): Promise<boolean> {
  if (!isEntitlementEnforcementActive()) return true;
  return isWithinDurationLimit(await loadEntitlementState(orgId), startDate, endDate, now);
}

/** The org's current span limit in days, or null when unrestricted. */
export async function orgMaxTournamentDays(orgId: string, now: Date = new Date()): Promise<number | null> {
  if (!isEntitlementEnforcementActive()) return null;
  return maxTournamentDays(await loadEntitlementState(orgId), now);
}

export async function countUnusedPasses(orgId: string): Promise<number> {
  return prisma.billingEvent.count({
    where: { orgId, tier: "TOURNAMENT_PASS", tournamentId: null },
  });
}

export async function canCreateTournament(orgId: string, now: Date = new Date()): Promise<boolean> {
  if (!isEntitlementEnforcementActive()) return true;

  const state = await loadEntitlementState(orgId);
  if (isSubscriptionActive(state, now)) return true;
  if (!state.freeTournamentUsed) return true;
  return (await countUnusedPasses(orgId)) > 0;
}

/**
 * Pod limits follow the *tournament's* coverage, not the org's tier: a
 * tournament bought with a pass runs unlimited pods even though the org is
 * otherwise on the free tier.
 */
export async function canCreatePod(tournamentId: string, now: Date = new Date()): Promise<boolean> {
  if (!isEntitlementEnforcementActive()) return true;

  const tournament = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    select: { orgId: true, coveringEntitlement: true, _count: { select: { pods: true } } },
  });

  const state = await loadEntitlementState(tournament.orgId);
  if (isSubscriptionActive(state, now)) return true;
  if (tournament.coveringEntitlement === "TOURNAMENT_PASS") return true;
  return tournament._count.pods < FREE_TIER_POD_LIMIT;
}

/**
 * Attach an entitlement to a newly created tournament, consuming a pass or the
 * lifetime free slot as needed. Returns what ended up covering it, or null when
 * no per-tournament coverage applies (active subscription, or enforcement off).
 *
 * Throws `no_tournament_entitlement` when the org has nothing left to spend —
 * callers should have asked canCreateTournament first; this is the transactional
 * backstop against two concurrent creates both passing that check.
 */
export async function claimTournamentCoverage(
  orgId: string,
  tournamentId: string,
  now: Date = new Date(),
): Promise<EntitlementTier | null> {
  if (!isEntitlementEnforcementActive()) return null;

  const state = await loadEntitlementState(orgId);
  if (isSubscriptionActive(state, now)) return null;

  // Spend the free slot before a paid pass. The other order would quietly burn
  // a pass the moment it was bought while the free slot sat unused, which is
  // both worse for the customer and not what rule 3 describes: a pass is spent
  // by an explicit upgrade, or once the free slot is genuinely gone.
  if (!state.freeTournamentUsed) {
    await prisma.$transaction([
      prisma.organization.update({ where: { id: orgId }, data: { freeTournamentUsed: true } }),
      prisma.tournament.update({ where: { id: tournamentId }, data: { coveringEntitlement: "FREE" } }),
    ]);
    return "FREE";
  }

  const unusedPass = await prisma.billingEvent.findFirst({
    where: { orgId, tier: "TOURNAMENT_PASS", tournamentId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (unusedPass) {
    await prisma.$transaction([
      prisma.billingEvent.update({ where: { id: unusedPass.id }, data: { tournamentId } }),
      prisma.tournament.update({ where: { id: tournamentId }, data: { coveringEntitlement: "TOURNAMENT_PASS" } }),
    ]);
    return "TOURNAMENT_PASS";
  }

  throw new Error("no_tournament_entitlement");
}

/**
 * Spend an unused pass on a tournament that already exists — the "upgrade my
 * existing tournament" half of ROADMAP-HOSTED.md rule 3. Upgrading the one
 * covered by the free slot hands that slot back, so the org ends up with one
 * free tournament plus one paid one either way it chooses.
 */
export async function applyPassToTournament(orgId: string, tournamentId: string): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, orgId: true, coveringEntitlement: true },
  });
  if (!tournament || tournament.orgId !== orgId) throw new Error("tournament_not_found");
  if (tournament.coveringEntitlement === "TOURNAMENT_PASS") throw new Error("already_upgraded");

  const unusedPass = await prisma.billingEvent.findFirst({
    where: { orgId, tier: "TOURNAMENT_PASS", tournamentId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!unusedPass) throw new Error("no_unused_pass");

  const returnsFreeSlot = tournament.coveringEntitlement === "FREE";

  await prisma.$transaction([
    prisma.billingEvent.update({ where: { id: unusedPass.id }, data: { tournamentId } }),
    prisma.tournament.update({ where: { id: tournamentId }, data: { coveringEntitlement: "TOURNAMENT_PASS" } }),
    ...(returnsFreeSlot
      ? [prisma.organization.update({ where: { id: orgId }, data: { freeTournamentUsed: false } })]
      : []),
  ]);
}
