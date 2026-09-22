// HI-8 — operator tooling for hosted-instance entitlements.
//
// This is the escape hatch: comping an org for a friend or partner, fixing up
// an org after a payment-processor webhook went missing, extending someone's
// data retention as a gesture, and changing tournament dates that the hosted
// UI locks (see ROADMAP-HOSTED.md rule 5 — the support contact shown next to
// that restriction resolves to a human running these commands).
//
// Reachable only with host/operator access, the same trust boundary as
// scripts/import-legacy.ts and scripts/oidc-relink.ts. There is deliberately
// no HTTP route for any of this.
//
// Every grant made here writes a BillingEvent with source OPERATOR, so the
// ledger stays the single answer to "why does this org have what it has" —
// processor payments and operator goodwill in one audit trail.
import type { EntitlementTier } from "../db.js";
import { prisma } from "../prisma.js";

export type OrgEntitlementSummary = {
  orgId: string;
  slug: string;
  name: string;
  tier: EntitlementTier;
  // Null on a SERIES org means a perpetual grant that never lapses — the
  // shape an operator comp takes. HI-3's activity check must read it that
  // way: active when null, or when still in the future.
  subscriptionExpiresAt: Date | null;
  cumulativePaidMonths: number;
  retentionOverrideUntil: Date | null;
  freeTournamentUsed: boolean;
  tournamentCount: number;
};

function addMonths(from: Date, months: number): Date {
  const result = new Date(from);
  result.setMonth(result.getMonth() + months);
  return result;
}

function assertPositiveMonths(months: number): void {
  if (!Number.isInteger(months) || months <= 0) {
    throw new Error("invalid_months");
  }
}

async function summarise(orgId: string): Promise<OrgEntitlementSummary> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    include: { _count: { select: { tournaments: true } } },
  });

  return {
    orgId: org.id,
    slug: org.slug,
    name: org.name,
    tier: org.entitlementTier,
    subscriptionExpiresAt: org.subscriptionExpiresAt,
    cumulativePaidMonths: org.cumulativePaidMonths,
    retentionOverrideUntil: org.retentionOverrideUntil,
    freeTournamentUsed: org.freeTournamentUsed,
    tournamentCount: org._count.tournaments,
  };
}

export async function getOrgEntitlementSummary(slug: string): Promise<OrgEntitlementSummary | null> {
  const org = await prisma.organization.findUnique({ where: { slug } });
  return org ? summarise(org.id) : null;
}

/**
 * Set an org's tier. On SERIES, `months` extends the subscription — from the
 * current expiry when one is still in the future, otherwise from now, so
 * topping up early never costs the remaining time. Omitting `months` on SERIES
 * grants it perpetually (no expiry), which is what a comp for a friend or
 * partner normally wants.
 */
export async function grantTier(
  slug: string,
  tier: EntitlementTier,
  options: { months?: number; note?: string } = {},
): Promise<OrgEntitlementSummary> {
  const { months, note } = options;
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) throw new Error("org_not_found");

  if (months !== undefined) {
    assertPositiveMonths(months);
    if (tier !== "SERIES") throw new Error("months_not_applicable");
  }

  const now = new Date();
  let expiresAt: Date | null = null;
  if (tier === "SERIES" && months !== undefined) {
    const base = org.subscriptionExpiresAt && org.subscriptionExpiresAt > now ? org.subscriptionExpiresAt : now;
    expiresAt = addMonths(base, months);
  }

  // A comped org should not lose its data sooner than a paying one would, so
  // granted months count toward the cumulative retention window just like
  // paid months do.
  await prisma.$transaction([
    prisma.organization.update({
      where: { id: org.id },
      data: {
        entitlementTier: tier,
        subscriptionExpiresAt: expiresAt,
        ...(months !== undefined ? { cumulativePaidMonths: { increment: months } } : {}),
      },
    }),
    prisma.billingEvent.create({
      data: {
        orgId: org.id,
        source: "OPERATOR",
        tier,
        paidMonths: months ?? 0,
        periodStart: months !== undefined ? now : null,
        periodEnd: expiresAt,
        note: note ?? null,
      },
    }),
  ]);

  return summarise(org.id);
}

/**
 * Push an org's data-retention deadline out, independently of what it paid.
 * Extends from the existing override when one is still in the future, so
 * repeated gestures accumulate rather than shortening the window.
 */
export async function extendRetention(slug: string, months: number, note?: string): Promise<OrgEntitlementSummary> {
  assertPositiveMonths(months);

  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) throw new Error("org_not_found");

  const now = new Date();
  const base = org.retentionOverrideUntil && org.retentionOverrideUntil > now ? org.retentionOverrideUntil : now;
  const until = addMonths(base, months);

  await prisma.$transaction([
    prisma.organization.update({
      where: { id: org.id },
      data: { retentionOverrideUntil: until },
    }),
    prisma.billingEvent.create({
      data: {
        orgId: org.id,
        source: "OPERATOR",
        tier: org.entitlementTier,
        paidMonths: 0,
        periodEnd: until,
        note: note ?? null,
      },
    }),
  ]);

  return summarise(org.id);
}

export type TournamentDateChange = {
  tournamentId: string;
  name: string;
  orgSlug: string;
  previousStartDate: Date;
  previousEndDate: Date;
  startDate: Date;
  endDate: Date;
};

/**
 * Change a tournament's dates on behalf of an organizer who cannot, because
 * the hosted instance locks them on the unsubscribed tiers. This is the
 * sanctioned override, so it deliberately does not apply that tier's duration
 * window — an operator honouring a support request is the one path allowed to
 * exceed it.
 */
export async function setTournamentDates(
  tournamentId: string,
  startDate: Date,
  endDate: Date,
): Promise<TournamentDateChange> {
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("invalid_date");
  }
  if (endDate < startDate) throw new Error("invalid_date_range");

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { organization: { select: { slug: true } } },
  });
  if (!tournament) throw new Error("tournament_not_found");

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { startDate, endDate },
  });

  return {
    tournamentId: tournament.id,
    name: tournament.name,
    orgSlug: tournament.organization.slug,
    previousStartDate: tournament.startDate,
    previousEndDate: tournament.endDate,
    startDate,
    endDate,
  };
}
