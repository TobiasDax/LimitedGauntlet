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

  // The reported bug: generating seatings creates round 1 so players can find
  // their seats, and a bye is auto-scored the instant it is created. With
  // "played" defined as "a round row exists", that unstarted pod credited its
  // bye entrant a win — and since nobody else had a point, crowned them
  // champion of a pod not one match had been played in.
  it("does not crown the bye entrant when round 1 is generated but never started", async () => {
    const org = await prisma.organization.create({ data: { slug: `hof-bye-${Date.now()}`, name: "Test Org" } });
    const t = await prisma.tournament.create({
      data: { orgId: org.id, name: "Weekend", startDate: new Date(), endDate: new Date() },
    });
    const [ann, ben, cal] = await Promise.all([
      prisma.player.create({ data: { orgId: org.id, displayName: "Ann" } }),
      prisma.player.create({ data: { orgId: org.id, displayName: "Ben" } }),
      prisma.player.create({ data: { orgId: org.id, displayName: "Cal" } }),
    ]);

    // Odd entrant count, so round 1 has a bye. Seatings generated, pod not
    // started: the round sits in PENDING.
    const pod = await prisma.pod.create({
      data: {
        tournamentId: t.id,
        name: "ME (seated, not started)",
        format: "DRAFT",
        sequenceOrder: 0,
        roundCount: 3,
        isMainEvent: true,
        status: "PAIRING",
      },
    });
    const [eAnn, eBen, eCal] = await Promise.all([
      prisma.entrant.create({ data: { podId: pod.id, playerId: ann.id } }),
      prisma.entrant.create({ data: { podId: pod.id, playerId: ben.id } }),
      prisma.entrant.create({ data: { podId: pod.id, playerId: cal.id } }),
    ]);
    const round1 = await prisma.round.create({
      data: { podId: pod.id, roundNumber: 1, status: "PENDING" },
    });
    await prisma.match.create({
      data: { roundId: round1.id, tableNumber: 1, entrantAId: eAnn.id, entrantBId: eBen.id },
    });
    // The bye, auto-scored on generation — this is what used to leak through.
    await prisma.match.create({
      data: {
        roundId: round1.id,
        tableNumber: 2,
        entrantAId: eCal.id,
        entrantBId: null,
        result: "A_WINS",
        gamesWonA: 2,
        reportedAt: new Date(),
      },
    });

    const rows = await computeHallOfFame(org.id);

    // Nobody has played anything: no crown, and the pod counts for no one.
    expect(rows.flatMap((r) => r.mainEventWins)).toEqual([]);
    for (const row of rows) {
      expect(row).toMatchObject({ podsPlayed: 0, totalPoints: 0 });
    }
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
