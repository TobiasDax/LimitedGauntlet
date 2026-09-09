import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildPlayerDataExport, playerExportFilename } from "./playerDataExport.js";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

async function setup() {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const org = await prisma.organization.create({ data: { slug: `px-${unique}`, name: "PX Org" } });
  const tournament = await prisma.tournament.create({
    data: { orgId: org.id, name: "Weekend", startDate: new Date("2026-01-01"), endDate: new Date("2026-01-03") },
  });
  const pod = await prisma.pod.create({
    data: {
      tournamentId: tournament.id,
      name: "Draft 1",
      format: "DRAFT",
      sequenceOrder: 0,
      roundCount: 1,
      matchFormat: "BO3",
    },
  });
  const alice = await prisma.player.create({ data: { orgId: org.id, displayName: "Alice" } });
  const bob = await prisma.player.create({ data: { orgId: org.id, displayName: "Bob" } });
  await prisma.tournamentPlayer.create({ data: { tournamentId: tournament.id, playerId: alice.id } });
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
      gamesWonB: 0,
      result: "A_WINS",
      reportedAt: new Date(),
    },
  });
  await prisma.cardPull.create({
    data: { podId: pod.id, playerId: alice.id, cardName: "Black Lotus", priceEur: "9999.00", setCode: "lea" },
  });
  return { org, tournament, pod, alice, bob, unique };
}

describe("buildPlayerDataExport (PI-105)", () => {
  it("collects one player's own data", async () => {
    const { org, alice } = await setup();
    const doc = await buildPlayerDataExport(org.id, alice.id);
    expect(doc).not.toBeNull();
    expect(doc!.player.displayName).toBe("Alice");
    expect(doc!.player.anonymised).toBe(false);
    expect(doc!.tournaments).toEqual([expect.objectContaining({ name: "Weekend", checkedIn: true })]);
    expect(doc!.pods).toEqual([expect.objectContaining({ pod: "Draft 1", finish: 1, team: null })]);
    expect(doc!.matches).toEqual([
      expect.objectContaining({ opponent: "Bob", result: "win", gamesFor: 2, gamesAgainst: 0, round: 1 }),
    ]);
    expect(doc!.cardPulls).toEqual([
      expect.objectContaining({ cardName: "Black Lotus", priceEur: 9999, setCode: "lea" }),
    ]);
    // Tokens off for this org → null ledger, not an empty array.
    expect(doc!.tokenLedger).toBeNull();
  });

  it("returns null for a player outside the org", async () => {
    const { alice } = await setup();
    const other = await prisma.organization.create({
      data: { slug: `px-o-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: "Other" },
    });
    expect(await buildPlayerDataExport(other.id, alice.id)).toBeNull();
  });

  it("builds a safe filename", () => {
    expect(playerExportFilename("Alice O'Brien")).toBe("limited-gauntlet-Alice-O-Brien-data.json");
    expect(playerExportFilename("  ")).toBe("limited-gauntlet-player-data.json");
  });
});
