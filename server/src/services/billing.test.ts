import { afterAll, describe, expect, it } from "vitest";
import { makePrismaClient } from "../db.js";
import { applySubscriptionPayment, recordPassPurchase, recordSubscriptionCancellation } from "./billing.js";
import { countUnusedPasses } from "./entitlementAccess.js";

const prisma = makePrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

let counter = 0;
async function makeOrg(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return prisma.organization.create({
    data: { slug: `bill-${Date.now()}-${counter}`, name: "Billing Test Org", ...overrides },
  });
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// The test DB persists across runs, and processorEventId is globally unique,
// so every event id must be fresh per run. Idempotency tests reuse one id.
const evtId = () => `evt-${Date.now()}-${(counter += 1)}`;

describe("recordPassPurchase", () => {
  it("records an unused pass as spendable capacity without changing org tier", async () => {
    const org = await makeOrg();

    const result = await recordPassPurchase(org.id, evtId(), { amountCents: 1111, currency: "eur" });

    expect(result).toEqual({ applied: true });
    expect(await countUnusedPasses(org.id)).toBe(1);
    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    // A bought pass is capacity, not an active tier — org state is untouched.
    expect(after.entitlementTier).toBe("FREE");
    expect(after.freeTournamentUsed).toBe(false);
  });

  // Stripe retries a webhook until it gets a 2xx, so the same event id can
  // arrive twice — the second must not mint a second pass.
  it("is idempotent on the processor event id", async () => {
    const org = await makeOrg();

    const id = evtId();
    const first = await recordPassPurchase(org.id, id);
    const second = await recordPassPurchase(org.id, id);

    expect(first).toEqual({ applied: true });
    expect(second).toEqual({ applied: false, reason: "duplicate" });
    expect(await countUnusedPasses(org.id)).toBe(1);
  });
});

describe("applySubscriptionPayment", () => {
  it("sets SERIES, the expiry to the paid-through date, and banks the months", async () => {
    const org = await makeOrg();
    const periodEnd = new Date(Date.now() + 30 * MS_PER_DAY);

    const result = await applySubscriptionPayment(org.id, evtId(), periodEnd, 1, {
      amountCents: 2222,
      currency: "eur",
    });

    expect(result).toEqual({ applied: true });
    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(after.entitlementTier).toBe("SERIES");
    expect(after.subscriptionExpiresAt?.toISOString()).toBe(periodEnd.toISOString());
    expect(after.cumulativePaidMonths).toBe(1);
  });

  // A renewal takes the same path: expiry moves to the new paid-through date
  // (set directly, since Stripe is authoritative), months accumulate.
  it("a renewal moves the expiry forward and accumulates months", async () => {
    const org = await makeOrg();
    const first = new Date(Date.now() + 30 * MS_PER_DAY);
    const renewal = new Date(Date.now() + 60 * MS_PER_DAY);

    await applySubscriptionPayment(org.id, evtId(), first, 1);
    await applySubscriptionPayment(org.id, evtId(), renewal, 1);

    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(after.subscriptionExpiresAt?.toISOString()).toBe(renewal.toISOString());
    expect(after.cumulativePaidMonths).toBe(2);
  });

  // The key idempotency guarantee: a redelivered renewal must not double-bank
  // months or the whole retention window inflates for free.
  it("is idempotent — a redelivered payment doesn't double-bank months", async () => {
    const org = await makeOrg();
    const periodEnd = new Date(Date.now() + 30 * MS_PER_DAY);

    const id = evtId();
    const first = await applySubscriptionPayment(org.id, id, periodEnd, 12);
    const second = await applySubscriptionPayment(org.id, id, periodEnd, 12);

    expect(first).toEqual({ applied: true });
    expect(second).toEqual({ applied: false, reason: "duplicate" });
    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(after.cumulativePaidMonths).toBe(12);
  });
});

describe("recordSubscriptionCancellation", () => {
  // Cancellation is recorded but does not revoke: the paid-through expiry
  // still governs, so access lapses naturally rather than being cut off.
  it("records the event but leaves the expiry untouched", async () => {
    const periodEnd = new Date(Date.now() + 20 * MS_PER_DAY);
    const org = await makeOrg({
      entitlementTier: "SERIES",
      subscriptionExpiresAt: periodEnd,
      cumulativePaidMonths: 3,
    });

    const result = await recordSubscriptionCancellation(org.id, evtId());

    expect(result).toEqual({ applied: true });
    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(after.subscriptionExpiresAt?.toISOString()).toBe(periodEnd.toISOString());
    expect(after.entitlementTier).toBe("SERIES");
  });

  it("is idempotent on the processor event id", async () => {
    const org = await makeOrg({ entitlementTier: "SERIES", subscriptionExpiresAt: new Date() });

    const id = evtId();
    await recordSubscriptionCancellation(org.id, id);
    const second = await recordSubscriptionCancellation(org.id, id);

    expect(second).toEqual({ applied: false, reason: "duplicate" });
  });
});
