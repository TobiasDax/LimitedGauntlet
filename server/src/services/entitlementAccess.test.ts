import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { config } from "../config.js";
import { makePrismaClient } from "../db.js";
import {
  applyPassToTournament,
  canCreatePod,
  canCreateTournament,
  claimTournamentCoverage,
  countUnusedPasses,
  isOrgDataAccessible,
} from "./entitlementAccess.js";

const prisma = makePrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(() => {
  config.hostedEntitlements.enforced = true;
});

afterEach(() => {
  config.hostedEntitlements.enforced = false;
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (n: number) => new Date(Date.now() + n * MS_PER_DAY);

let counter = 0;
async function makeOrg(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return prisma.organization.create({
    data: { slug: `acc-${Date.now()}-${counter}`, name: "Access Test Org", ...overrides },
  });
}

async function makeTournament(orgId: string, overrides: Record<string, unknown> = {}) {
  return prisma.tournament.create({
    data: {
      orgId,
      name: "Weekend",
      startDate: daysFromNow(-10),
      endDate: daysFromNow(-8),
      ...overrides,
    },
  });
}

async function buyPass(orgId: string) {
  return prisma.billingEvent.create({
    data: { orgId, source: "PROCESSOR", tier: "TOURNAMENT_PASS", processorEventId: `evt-${Date.now()}-${++counter}` },
  });
}

describe("isOrgDataAccessible", () => {
  it("is always true when enforcement is off", async () => {
    config.hostedEntitlements.enforced = false;
    const org = await makeOrg();
    await makeTournament(org.id, { startDate: daysFromNow(-400), endDate: daysFromNow(-390) });

    expect(await isOrgDataAccessible(org.id)).toBe(true);
  });

  it("locks a free org a month after its last tournament ended", async () => {
    const org = await makeOrg();
    await makeTournament(org.id, { startDate: daysFromNow(-60), endDate: daysFromNow(-50) });

    expect(await isOrgDataAccessible(org.id)).toBe(false);
  });

  it("keeps a free org readable inside the retention month", async () => {
    const org = await makeOrg();
    await makeTournament(org.id, { startDate: daysFromNow(-10), endDate: daysFromNow(-8) });

    expect(await isOrgDataAccessible(org.id)).toBe(true);
  });

  it("keeps a subscribed org readable no matter how old its tournaments are", async () => {
    const org = await makeOrg({ entitlementTier: "SERIES", subscriptionExpiresAt: daysFromNow(30) });
    await makeTournament(org.id, { startDate: daysFromNow(-900), endDate: daysFromNow(-890) });

    expect(await isOrgDataAccessible(org.id)).toBe(true);
  });

  // The whole point of "inaccessible, not deleted": the rows are still there.
  it("leaves the data in place when it locks", async () => {
    const org = await makeOrg();
    const tournament = await makeTournament(org.id, { startDate: daysFromNow(-60), endDate: daysFromNow(-50) });

    expect(await isOrgDataAccessible(org.id)).toBe(false);
    expect(await prisma.tournament.findUnique({ where: { id: tournament.id } })).not.toBeNull();
  });
});

describe("canCreateTournament", () => {
  it("allows the lifetime free tournament", async () => {
    const org = await makeOrg();
    expect(await canCreateTournament(org.id)).toBe(true);
  });

  it("refuses a second one once the free slot is spent", async () => {
    const org = await makeOrg({ freeTournamentUsed: true });
    expect(await canCreateTournament(org.id)).toBe(false);
  });

  it("allows another once a pass has been bought", async () => {
    const org = await makeOrg({ freeTournamentUsed: true });
    await buyPass(org.id);

    expect(await canCreateTournament(org.id)).toBe(true);
  });

  it("does not count a pass that is already attached to a tournament", async () => {
    const org = await makeOrg({ freeTournamentUsed: true });
    const tournament = await makeTournament(org.id);
    const pass = await buyPass(org.id);
    await prisma.billingEvent.update({ where: { id: pass.id }, data: { tournamentId: tournament.id } });

    expect(await countUnusedPasses(org.id)).toBe(0);
    expect(await canCreateTournament(org.id)).toBe(false);
  });

  it("allows unlimited tournaments on an active subscription", async () => {
    const org = await makeOrg({
      entitlementTier: "SERIES",
      subscriptionExpiresAt: daysFromNow(30),
      freeTournamentUsed: true,
    });

    expect(await canCreateTournament(org.id)).toBe(true);
  });

  it("refuses once a subscription has lapsed and the free slot is gone", async () => {
    const org = await makeOrg({
      entitlementTier: "SERIES",
      subscriptionExpiresAt: daysFromNow(-1),
      freeTournamentUsed: true,
    });

    expect(await canCreateTournament(org.id)).toBe(false);
  });
});

describe("canCreatePod", () => {
  it("allows the first pod in a free tournament and refuses the second", async () => {
    const org = await makeOrg();
    const tournament = await makeTournament(org.id, { coveringEntitlement: "FREE" });

    expect(await canCreatePod(tournament.id)).toBe(true);

    await prisma.pod.create({
      data: { tournamentId: tournament.id, name: "Pod 1", format: "DRAFT", sequenceOrder: 1 },
    });

    expect(await canCreatePod(tournament.id)).toBe(false);
  });

  // A pass buys quantity inside the tournament it covers, even though the org
  // itself is still otherwise on the free tier.
  it("allows unlimited pods in a pass-covered tournament", async () => {
    const org = await makeOrg({ freeTournamentUsed: true });
    const tournament = await makeTournament(org.id, { coveringEntitlement: "TOURNAMENT_PASS" });
    await prisma.pod.create({
      data: { tournamentId: tournament.id, name: "Pod 1", format: "DRAFT", sequenceOrder: 1 },
    });

    expect(await canCreatePod(tournament.id)).toBe(true);
  });

  it("allows unlimited pods on an active subscription", async () => {
    const org = await makeOrg({ entitlementTier: "SERIES", subscriptionExpiresAt: daysFromNow(30) });
    const tournament = await makeTournament(org.id);
    await prisma.pod.create({
      data: { tournamentId: tournament.id, name: "Pod 1", format: "DRAFT", sequenceOrder: 1 },
    });

    expect(await canCreatePod(tournament.id)).toBe(true);
  });

  it("imposes no limit when enforcement is off", async () => {
    config.hostedEntitlements.enforced = false;
    const org = await makeOrg();
    const tournament = await makeTournament(org.id, { coveringEntitlement: "FREE" });
    await prisma.pod.create({
      data: { tournamentId: tournament.id, name: "Pod 1", format: "DRAFT", sequenceOrder: 1 },
    });

    expect(await canCreatePod(tournament.id)).toBe(true);
  });
});

describe("claimTournamentCoverage", () => {
  it("spends the free slot first, leaving a bought pass untouched", async () => {
    const org = await makeOrg();
    await buyPass(org.id);
    const tournament = await makeTournament(org.id);

    expect(await claimTournamentCoverage(org.id, tournament.id)).toBe("FREE");

    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(after.freeTournamentUsed).toBe(true);
    expect(await countUnusedPasses(org.id)).toBe(1);
  });

  it("spends a pass once the free slot is gone, attaching it to the tournament", async () => {
    const org = await makeOrg({ freeTournamentUsed: true });
    const pass = await buyPass(org.id);
    const tournament = await makeTournament(org.id);

    expect(await claimTournamentCoverage(org.id, tournament.id)).toBe("TOURNAMENT_PASS");

    const attached = await prisma.billingEvent.findUniqueOrThrow({ where: { id: pass.id } });
    expect(attached.tournamentId).toBe(tournament.id);
  });

  it("claims nothing on an active subscription", async () => {
    const org = await makeOrg({ entitlementTier: "SERIES", subscriptionExpiresAt: daysFromNow(30) });
    const tournament = await makeTournament(org.id);

    expect(await claimTournamentCoverage(org.id, tournament.id)).toBeNull();

    const stored = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(stored.coveringEntitlement).toBeNull();
  });

  it("claims nothing when enforcement is off", async () => {
    config.hostedEntitlements.enforced = false;
    const org = await makeOrg();
    const tournament = await makeTournament(org.id);

    expect(await claimTournamentCoverage(org.id, tournament.id)).toBeNull();

    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(after.freeTournamentUsed).toBe(false);
  });

  // The backstop against two concurrent creates both passing canCreateTournament.
  it("throws when there is nothing left to spend", async () => {
    const org = await makeOrg({ freeTournamentUsed: true });
    const tournament = await makeTournament(org.id);

    await expect(claimTournamentCoverage(org.id, tournament.id)).rejects.toThrow("no_tournament_entitlement");
  });
});

describe("applyPassToTournament", () => {
  // Rule 3: upgrading the free tournament hands the free slot back, so the org
  // ends up with one free plus one paid either way it chooses.
  it("upgrades the free tournament and returns the free slot", async () => {
    const org = await makeOrg({ freeTournamentUsed: true });
    const tournament = await makeTournament(org.id, { coveringEntitlement: "FREE" });
    await buyPass(org.id);

    await applyPassToTournament(org.id, tournament.id);

    const storedTournament = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    const storedOrg = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(storedTournament.coveringEntitlement).toBe("TOURNAMENT_PASS");
    expect(storedOrg.freeTournamentUsed).toBe(false);
    expect(await countUnusedPasses(org.id)).toBe(0);
    expect(await canCreateTournament(org.id)).toBe(true);
  });

  it("refuses without an unused pass", async () => {
    const org = await makeOrg({ freeTournamentUsed: true });
    const tournament = await makeTournament(org.id, { coveringEntitlement: "FREE" });

    await expect(applyPassToTournament(org.id, tournament.id)).rejects.toThrow("no_unused_pass");
  });

  it("refuses to upgrade a tournament that is already pass-covered", async () => {
    const org = await makeOrg();
    const tournament = await makeTournament(org.id, { coveringEntitlement: "TOURNAMENT_PASS" });
    await buyPass(org.id);

    await expect(applyPassToTournament(org.id, tournament.id)).rejects.toThrow("already_upgraded");
  });

  it("refuses a tournament belonging to another org", async () => {
    const owner = await makeOrg();
    const stranger = await makeOrg();
    const tournament = await makeTournament(owner.id, { coveringEntitlement: "FREE" });
    await buyPass(stranger.id);

    await expect(applyPassToTournament(stranger.id, tournament.id)).rejects.toThrow("tournament_not_found");
  });
});
