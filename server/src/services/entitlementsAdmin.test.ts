import { afterAll, describe, expect, it } from "vitest";
import { makePrismaClient } from "../db.js";
import { extendRetention, getOrgEntitlementSummary, grantTier, setTournamentDates } from "./entitlementsAdmin.js";

const prisma = makePrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

let counter = 0;
async function makeOrg(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return prisma.organization.create({
    data: { slug: `ent-${Date.now()}-${counter}`, name: "Entitlements Test Org", ...overrides },
  });
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe("grantTier", () => {
  // The comp case: a friend or partner gets SERIES that simply never lapses.
  it("grants SERIES perpetually when no months are given", async () => {
    const org = await makeOrg();

    const summary = await grantTier(org.slug, "SERIES", { note: "partner" });

    expect(summary.tier).toBe("SERIES");
    expect(summary.subscriptionExpiresAt).toBeNull();
    expect(summary.cumulativePaidMonths).toBe(0);

    const events = await prisma.billingEvent.findMany({ where: { orgId: org.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ source: "OPERATOR", tier: "SERIES", paidMonths: 0, note: "partner" });
  });

  it("sets an expiry and banks the months when granting a fixed period", async () => {
    const org = await makeOrg();
    const before = Date.now();

    const summary = await grantTier(org.slug, "SERIES", { months: 12 });

    expect(summary.cumulativePaidMonths).toBe(12);
    expect(summary.subscriptionExpiresAt).not.toBeNull();
    // Twelve months out, give or take the clock moving during the test.
    const elapsedDays = (summary.subscriptionExpiresAt!.getTime() - before) / MS_PER_DAY;
    expect(elapsedDays).toBeGreaterThan(360);
    expect(elapsedDays).toBeLessThan(370);
  });

  // Topping up early must not throw away time already paid for.
  it("extends from an existing future expiry rather than from now", async () => {
    const futureExpiry = new Date(Date.now() + 60 * MS_PER_DAY);
    const org = await makeOrg({
      entitlementTier: "SERIES",
      subscriptionExpiresAt: futureExpiry,
      cumulativePaidMonths: 2,
    });

    const summary = await grantTier(org.slug, "SERIES", { months: 1 });

    expect(summary.cumulativePaidMonths).toBe(3);
    // One month past the *old* expiry, not one month from today.
    const daysPastOldExpiry = (summary.subscriptionExpiresAt!.getTime() - futureExpiry.getTime()) / MS_PER_DAY;
    expect(daysPastOldExpiry).toBeGreaterThan(26);
  });

  it("restarts from now when the previous subscription already lapsed", async () => {
    const org = await makeOrg({
      entitlementTier: "SERIES",
      subscriptionExpiresAt: new Date(Date.now() - 30 * MS_PER_DAY),
    });

    const summary = await grantTier(org.slug, "SERIES", { months: 1 });

    expect(summary.subscriptionExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses months on a tier that has no subscription period", async () => {
    const org = await makeOrg();
    await expect(grantTier(org.slug, "FREE", { months: 3 })).rejects.toThrow("months_not_applicable");
  });

  it("rejects a non-positive month count", async () => {
    const org = await makeOrg();
    await expect(grantTier(org.slug, "SERIES", { months: 0 })).rejects.toThrow("invalid_months");
  });

  it("rejects an unknown org", async () => {
    await expect(grantTier("no-such-org", "SERIES")).rejects.toThrow("org_not_found");
  });

  it("can downgrade an org back to FREE", async () => {
    const org = await makeOrg({ entitlementTier: "SERIES", subscriptionExpiresAt: new Date() });

    const summary = await grantTier(org.slug, "FREE");

    expect(summary.tier).toBe("FREE");
    expect(summary.subscriptionExpiresAt).toBeNull();
  });
});

describe("extendRetention", () => {
  it("pushes the retention deadline out from now", async () => {
    const org = await makeOrg();

    const summary = await extendRetention(org.slug, 6, "long-time supporter");

    expect(summary.retentionOverrideUntil).not.toBeNull();
    const days = (summary.retentionOverrideUntil!.getTime() - Date.now()) / MS_PER_DAY;
    expect(days).toBeGreaterThan(170);

    const events = await prisma.billingEvent.findMany({ where: { orgId: org.id } });
    expect(events[0]).toMatchObject({ source: "OPERATOR", paidMonths: 0, note: "long-time supporter" });
  });

  // Repeated gestures should accumulate, never shorten an existing window.
  it("extends from an existing future override", async () => {
    const existing = new Date(Date.now() + 90 * MS_PER_DAY);
    const org = await makeOrg({ retentionOverrideUntil: existing });

    const summary = await extendRetention(org.slug, 1);

    expect(summary.retentionOverrideUntil!.getTime()).toBeGreaterThan(existing.getTime());
  });

  it("rejects a non-positive month count", async () => {
    const org = await makeOrg();
    await expect(extendRetention(org.slug, -1)).rejects.toThrow("invalid_months");
  });
});

describe("setTournamentDates", () => {
  async function makeTournament() {
    const org = await makeOrg();
    const tournament = await prisma.tournament.create({
      data: {
        orgId: org.id,
        name: "Test Weekend",
        startDate: new Date("2026-10-02T00:00:00.000Z"),
        endDate: new Date("2026-10-04T00:00:00.000Z"),
      },
    });
    return { org, tournament };
  }

  it("changes the dates and reports what they were", async () => {
    const { tournament } = await makeTournament();
    const newStart = new Date("2026-11-06T00:00:00.000Z");
    const newEnd = new Date("2026-11-08T00:00:00.000Z");

    const change = await setTournamentDates(tournament.id, newStart, newEnd);

    expect(change.previousStartDate.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(change.startDate.toISOString()).toBe(newStart.toISOString());

    const stored = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(stored.endDate.toISOString()).toBe(newEnd.toISOString());
  });

  // The operator override deliberately ignores the unsubscribed-tier window,
  // since honouring a support request is exactly the case that needs to
  // exceed it.
  it("allows a span longer than the unsubscribed-tier window", async () => {
    const { tournament } = await makeTournament();

    const change = await setTournamentDates(
      tournament.id,
      new Date("2026-10-01T00:00:00.000Z"),
      new Date("2026-10-30T00:00:00.000Z"),
    );

    const spanDays = (change.endDate.getTime() - change.startDate.getTime()) / MS_PER_DAY;
    expect(spanDays).toBe(29);
  });

  it("rejects an end before the start", async () => {
    const { tournament } = await makeTournament();
    await expect(
      setTournamentDates(tournament.id, new Date("2026-10-04T00:00:00.000Z"), new Date("2026-10-02T00:00:00.000Z")),
    ).rejects.toThrow("invalid_date_range");
  });

  it("rejects an unknown tournament", async () => {
    await expect(
      setTournamentDates("no-such-tournament", new Date("2026-10-02"), new Date("2026-10-04")),
    ).rejects.toThrow("tournament_not_found");
  });
});

describe("getOrgEntitlementSummary", () => {
  it("returns null for an unknown slug", async () => {
    expect(await getOrgEntitlementSummary("definitely-not-an-org")).toBeNull();
  });

  it("counts the org's tournaments", async () => {
    const org = await makeOrg();
    await prisma.tournament.create({
      data: { orgId: org.id, name: "T1", startDate: new Date(), endDate: new Date() },
    });

    const summary = await getOrgEntitlementSummary(org.slug);

    expect(summary?.tournamentCount).toBe(1);
    expect(summary?.freeTournamentUsed).toBe(false);
  });
});
