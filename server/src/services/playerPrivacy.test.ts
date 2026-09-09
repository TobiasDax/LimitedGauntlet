import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { anonymisePlayer, getHiddenPlayerIds, rosterNameTaken, setPlayerPublicHidden } from "./playerPrivacy.js";
import { computePodStandings } from "./standings.js";
import { getPlayerTokenBalance } from "./tokens.js";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

async function setup() {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const org = await prisma.organization.create({ data: { slug: `pp-${unique}`, name: "PP Org" } });
  const organizer = await prisma.organizerAccount.create({
    data: {
      name: "Org",
      email: `org-${unique}@example.com`,
      passwordHash: "x",
      memberships: { create: { orgId: org.id } },
    },
  });
  const tournament = await prisma.tournament.create({
    data: { orgId: org.id, name: "T", startDate: new Date(), endDate: new Date() },
  });
  const pod = await prisma.pod.create({
    data: {
      tournamentId: tournament.id,
      name: "Pod 1",
      format: "DRAFT",
      sequenceOrder: 0,
      roundCount: 1,
      matchFormat: "BO3",
    },
  });
  const alice = await prisma.player.create({ data: { orgId: org.id, displayName: "Alice" } });
  const bob = await prisma.player.create({ data: { orgId: org.id, displayName: "Bob" } });
  const ea = await prisma.entrant.create({ data: { podId: pod.id, playerId: alice.id } });
  const eb = await prisma.entrant.create({ data: { podId: pod.id, playerId: bob.id } });
  const round = await prisma.round.create({ data: { podId: pod.id, roundNumber: 1, status: "COMPLETED" } });
  await prisma.match.create({
    data: {
      roundId: round.id,
      tableNumber: 1,
      entrantAId: ea.id,
      entrantBId: eb.id,
      gamesWonA: 2,
      gamesWonB: 1,
      result: "A_WINS",
      reportedAt: new Date(),
    },
  });
  return { org, organizer, tournament, pod, alice, bob, ea, eb, unique };
}

describe("anonymisePlayer (PI-104)", () => {
  it("scrubs identity but leaves the competitive record byte-identical", async () => {
    const { org, pod, alice, organizer } = await setup();

    // Give Alice a login + a pending invite + a token note.
    const identity = await prisma.playerIdentity.create({
      data: { email: `alice-${org.slug}@example.com`, passwordHash: "x" },
    });
    await prisma.player.update({
      where: { id: alice.id },
      data: { email: identity.email, identityId: identity.id },
    });
    await prisma.playerInvite.create({
      data: {
        orgId: org.id,
        playerId: alice.id,
        email: `alice2-${org.slug}@example.com`,
        tokenHash: `h-${org.slug}`,
        invitedById: organizer.id,
        expiresAt: new Date(Date.now() + 1e6),
      },
    });
    await prisma.tokenTransaction.create({
      data: { orgId: org.id, playerId: alice.id, delta: 5, reason: "MANUAL", note: "Alice — showed up late" },
    });

    const standingsBefore = await computePodStandings(pod.id);
    const balanceBefore = await getPlayerTokenBalance(org.id, alice.id);

    const result = await anonymisePlayer(org.id, alice.id);
    expect(result).not.toBeNull();
    expect(result!.alreadyAnonymised).toBe(false);
    expect(result!.displayName).toMatch(/^Anonymised player /);

    const after = await prisma.player.findUniqueOrThrow({ where: { id: alice.id } });
    expect(after.displayName).toBe(result!.displayName);
    expect(after.email).toBeNull();
    expect(after.identityId).toBeNull();
    expect(after.anonymisedAt).not.toBeNull();

    // Identity row survives (may be a login elsewhere); invites are gone; note is blanked.
    expect(await prisma.playerIdentity.findUnique({ where: { id: identity.id } })).not.toBeNull();
    expect(await prisma.playerInvite.count({ where: { playerId: alice.id } })).toBe(0);
    const txn = await prisma.tokenTransaction.findFirstOrThrow({ where: { playerId: alice.id } });
    expect(txn.note).toBeNull();

    // The record is untouched: same standings, same balance, entrant + match still there.
    expect(await computePodStandings(pod.id)).toEqual(standingsBefore);
    expect(await getPlayerTokenBalance(org.id, alice.id)).toBe(balanceBefore);
    expect(await prisma.entrant.count({ where: { playerId: alice.id } })).toBe(1);
    expect(await prisma.match.count({ where: { entrantA: { playerId: alice.id } } })).toBe(1);
  });

  it("is idempotent", async () => {
    const { org, alice } = await setup();
    const first = await anonymisePlayer(org.id, alice.id);
    const second = await anonymisePlayer(org.id, alice.id);
    expect(second!.alreadyAnonymised).toBe(true);
    expect(second!.displayName).toBe(first!.displayName);
  });

  it("returns null for a player outside the org", async () => {
    const { alice } = await setup();
    const other = await prisma.organization.create({
      data: { slug: `pp-other-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: "Other" },
    });
    expect(await anonymisePlayer(other.id, alice.id)).toBeNull();
  });
});

describe("setPlayerPublicHidden / getHiddenPlayerIds (PI-107)", () => {
  it("sets and clears the flag", async () => {
    const { org, alice, bob } = await setup();
    expect(await getHiddenPlayerIds(org.id)).toEqual(new Set());

    const hidden = await setPlayerPublicHidden(org.id, alice.id, true);
    expect(hidden!.publicHiddenAt).not.toBeNull();
    expect(await getHiddenPlayerIds(org.id)).toEqual(new Set([alice.id]));

    // A repeat set is a no-op that keeps the original timestamp.
    const again = await setPlayerPublicHidden(org.id, alice.id, true);
    expect(again!.publicHiddenAt!.getTime()).toBe(hidden!.publicHiddenAt!.getTime());

    await setPlayerPublicHidden(org.id, alice.id, false);
    expect(await getHiddenPlayerIds(org.id)).toEqual(new Set());
    expect(await setPlayerPublicHidden(org.id, bob.id, false)).toMatchObject({ publicHiddenAt: null });
  });

  it("returns null for a player outside the org", async () => {
    const { alice } = await setup();
    const other = await prisma.organization.create({
      data: { slug: `pp-o2-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: "Other" },
    });
    expect(await setPlayerPublicHidden(other.id, alice.id, true)).toBeNull();
  });
});

describe("rosterNameTaken", () => {
  it("is case-insensitive and can exclude one id", async () => {
    const { org, alice } = await setup();
    expect(await rosterNameTaken(org.id, "alice")).toBe(true);
    expect(await rosterNameTaken(org.id, "ALICE", alice.id)).toBe(false);
    expect(await rosterNameTaken(org.id, "Nobody")).toBe(false);
  });
});
