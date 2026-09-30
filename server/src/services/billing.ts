// HI-7 Layer A — applying an incoming payment to an org's entitlements.
//
// Deliberately processor-agnostic: these take normalised primitives (an org
// id, the processor's event id, a period end, a month count), never a Stripe
// object. The Stripe adapter (routes/stripe.ts) verifies + parses the webhook
// and calls in here; swapping processors would touch only that adapter, not
// this. The ledger (BillingEvent) is the source of truth — the fields on
// Organization are a cache these functions keep in step.
//
// Every write is idempotent on `processorEventId`, which is unique on
// BillingEvent: a webhook Stripe redelivers (it retries until it gets a 2xx)
// must not grant twice. The ledger insert and the derived-state update share
// one transaction, so a duplicate insert rolls the whole thing back rather
// than double-applying the org update.
import { Prisma } from "../db.js";
import { prisma } from "../prisma.js";

export type ApplyResult = { applied: true } | { applied: false; reason: "duplicate" };

// A unique-constraint violation from these writes can only ever be the
// processorEventId (the org FK isn't unique, ids are freshly generated), so a
// bare P2002 here *is* a redelivered event — no need to inspect meta.target,
// whose shape varies by Prisma/DB version.
function isDuplicateEvent(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

type Money = { amountCents?: number; currency?: string };

/**
 * A completed one-time pass purchase. Records an *unused* TOURNAMENT_PASS
 * ledger row (no tournamentId) — an available credit that
 * claimTournamentCoverage / applyPassToTournament later spends on a specific
 * tournament. Deliberately does not touch Organization state: a bought pass is
 * spendable capacity, not an active tier.
 */
export async function recordPassPurchase(
  orgId: string,
  processorEventId: string,
  money: Money = {},
): Promise<ApplyResult> {
  try {
    await prisma.billingEvent.create({
      data: {
        orgId,
        source: "PROCESSOR",
        tier: "TOURNAMENT_PASS",
        processorEventId,
        amountCents: money.amountCents ?? null,
        currency: money.currency ?? null,
        paidMonths: 0,
      },
    });
    return { applied: true };
  } catch (err) {
    if (isDuplicateEvent(err)) return { applied: false, reason: "duplicate" };
    throw err;
  }
}

/**
 * A subscription payment — the initial one and every renewal take the same
 * path. `periodEnd` is Stripe's authoritative "paid through" date, so the
 * subscription expiry is set to it directly (not extended from the current
 * value): each invoice tells us exactly how far the customer is now covered.
 * `paidMonths` is banked into the cumulative retention window (see
 * dataAccessibleUntil). Sets the tier to SERIES.
 */
export async function applySubscriptionPayment(
  orgId: string,
  processorEventId: string,
  periodEnd: Date,
  paidMonths: number,
  money: Money = {},
): Promise<ApplyResult> {
  try {
    await prisma.$transaction([
      prisma.billingEvent.create({
        data: {
          orgId,
          source: "PROCESSOR",
          tier: "SERIES",
          processorEventId,
          amountCents: money.amountCents ?? null,
          currency: money.currency ?? null,
          periodEnd,
          paidMonths,
        },
      }),
      prisma.organization.update({
        where: { id: orgId },
        data: {
          entitlementTier: "SERIES",
          subscriptionExpiresAt: periodEnd,
          cumulativePaidMonths: { increment: paidMonths },
        },
      }),
    ]);
    return { applied: true };
  } catch (err) {
    if (isDuplicateEvent(err)) return { applied: false, reason: "duplicate" };
    throw err;
  }
}

/**
 * A subscription ended (Stripe `customer.subscription.deleted`). Recorded for
 * the audit trail, but deliberately does NOT revoke access: the customer paid
 * through `subscriptionExpiresAt`, so access lapses naturally when that date
 * passes (effectiveTier falls back to FREE) and the cumulative-months
 * retention window then governs their data. Cancelling early shouldn't cut off
 * a period already paid for.
 */
export async function recordSubscriptionCancellation(orgId: string, processorEventId: string): Promise<ApplyResult> {
  try {
    await prisma.billingEvent.create({
      data: {
        orgId,
        source: "PROCESSOR",
        tier: "SERIES",
        processorEventId,
        paidMonths: 0,
        note: "subscription cancelled",
      },
    });
    return { applied: true };
  } catch (err) {
    if (isDuplicateEvent(err)) return { applied: false, reason: "duplicate" };
    throw err;
  }
}
