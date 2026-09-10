import { afterAll, describe, expect, it } from "vitest";
import { makePrismaClient } from "../db.js";
import { computeHallOfFame } from "./hallOfFame.js";

const prisma = makePrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("computeHallOfFame", () => {
  // PI-99: a main-event pod still in SETUP (paired for nobody, no rounds)
  // must not appear in the Hall of Fame at all — its all-zero standings
  // would otherwise crown standings[0] as champion and credit every
  // pre-assigned entrant a "pod played". A points-only imported pod
  // (COMPLETED, no Round rows) must still count.
  it("skips not-yet-started pods, no phantom champion, but keeps points-only imports", async () => {
    const org = await prisma.organization.create({ data: { slug: `hof-${Date.now()}`, name: "Test Org" } });
    const t = await prisma.tournament.create({
      data: { orgId: org.id, name: "Weekend", startDate: new Date(), endDate: new Date() },
    });
    const [ann, ben] = await Promise.all([
      prisma.player.create({ data: { orgId: org.id, displayName: "Ann" } }),
      prisma.player.create({ data: { orgId: org.id, displayName: "Ben" } }),
    ]);

    // SETUP main event — entrants assigned, never paired.
    const setupME = await prisma.pod.create({
      data: {
        tournamentId: t.id,
        name: "ME (not started)",
        format: "DRAFT",
        sequenceOrder: 0,
        roundCount: 3,
        isMainEvent: true,
      },
    });
    await prisma.entrant.create({ data: { podId: setupME.id, playerId: ann.id } });
    await prisma.entrant.create({ data: { podId: setupME.id, playerId: ben.id } });

    // Points-only imported pod: COMPLETED, no rounds, finalPointsOverride.
    const imported = await prisma.pod.create({
      data: {
        tournamentId: t.id,
        name: "Imported",
        format: "DRAFT",
        sequenceOrder: 1,
        roundCount: 3,
        status: "COMPLETED",
      },
    });
    await prisma.entrant.create({ data: { podId: imported.id, playerId: ann.id, finalPointsOverride: 9 } });
    await prisma.entrant.create({ data: { podId: imported.id, playerId: ben.id, finalPointsOverride: 3 } });

    const rows = await computeHallOfFame(org.id);
    const byPlayer = new Map(rows.map((r) => [r.playerId, r]));

    // Only the imported pod counts: 1 pod each, nobody has a main-event win.
    expect(byPlayer.get(ann.id)).toMatchObject({ podsPlayed: 1, totalPoints: 9, mainEventWins: [] });
    expect(byPlayer.get(ben.id)).toMatchObject({ podsPlayed: 1, totalPoints: 3, mainEventWins: [] });
    expect(rows.flatMap((r) => r.mainEventWins)).toEqual([]);
  });

  // Once the main event is actually played, the crown appears as normal.
  it("crowns the winner of a played main event", async () => {
    const org = await prisma.organization.create({ data: { slug: `hof-me-${Date.now()}`, name: "Test Org" } });
    const t = await prisma.tournament.create({
      data: { orgId: org.id, name: "Weekend", startDate: new Date(), endDate: new Date() },
    });
    const [ann, ben] = await Promise.all([
      prisma.player.create({ data: { orgId: org.id, displayName: "Ann" } }),
      prisma.player.create({ data: { orgId: org.id, displayName: "Ben" } }),
    ]);
    const me = await prisma.pod.create({
      data: {
        tournamentId: t.id,
        name: "ME",
        format: "DRAFT",
        sequenceOrder: 0,
        roundCount: 1,
        isMainEvent: true,
      },
    });
    const eAnn = await prisma.entrant.create({ data: { podId: me.id, playerId: ann.id } });
    const eBen = await prisma.entrant.create({ data: { podId: me.id, playerId: ben.id } });
    const round = await prisma.round.create({ data: { podId: me.id, roundNumber: 1, status: "COMPLETED" } });
    await prisma.match.create({
      data: {
        roundId: round.id,
        tableNumber: 1,
        entrantAId: eAnn.id,
        entrantBId: eBen.id,
        result: "A_WINS",
        reportedAt: new Date(),
      },
    });

    const rows = await computeHallOfFame(org.id);
    const byPlayer = new Map(rows.map((r) => [r.playerId, r]));
    expect(byPlayer.get(ann.id)?.mainEventWins.map((w) => w.podName)).toEqual(["ME"]);
    expect(byPlayer.get(ben.id)?.mainEventWins).toEqual([]);
  });
});
