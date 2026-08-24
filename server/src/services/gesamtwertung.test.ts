import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { computeGesamtwertung } from "./gesamtwertung.js";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("computeGesamtwertung", () => {
  // Isolates the exact property a real tournament's historical data
  // needed: ranking by average-per-pod-played, not raw total, so a
  // player who attended fewer pods isn't penalized for it. (A real case
  // from that data: one player with a lower raw total but fewer pods
  // attended out-ranked another player with a higher total by average —
  // hand-verified against every player's real number before writing this
  // test; the real data itself lives outside this repo, see README's
  // "History import" section.) This test reproduces the same shape of
  // case with a small, fully-controlled scenario instead of refitting
  // real players, since Step 5's standings math — the harder part — is
  // already verified separately against real data (standings.test.ts);
  // Step 6 only needs to prove the cross-pod aggregation and re-ranking
  // are correct.
  it("ranks by average points per pod played, not raw total", async () => {
    const org = await prisma.organization.create({ data: { slug: `gw-${Date.now()}`, name: "Test Org" } });
    const tournament = await prisma.tournament.create({
      data: { orgId: org.id, name: "Test Weekend", startDate: new Date(), endDate: new Date() },
    });

    const [a, b, c, d] = await Promise.all([
      prisma.player.create({ data: { orgId: org.id, displayName: "A" } }),
      prisma.player.create({ data: { orgId: org.id, displayName: "B" } }),
      prisma.player.create({ data: { orgId: org.id, displayName: "C" } }),
      prisma.player.create({ data: { orgId: org.id, displayName: "D" } }),
    ]);

    async function makePod(name: string, sequenceOrder: number) {
      return prisma.pod.create({
        data: { tournamentId: tournament.id, name, format: "DRAFT", sequenceOrder, roundCount: 1 },
      });
    }

    async function playSingleRound(
      podId: string,
      matches: Array<{ a: { id: string }; b: { id: string } | null; result?: "A_WINS" | "B_WINS" }>,
    ) {
      const round = await prisma.round.create({ data: { podId, roundNumber: 1, status: "COMPLETED" } });
      await prisma.match.createMany({
        data: matches.map((m, i) => ({
          roundId: round.id,
          tableNumber: i + 1,
          entrantAId: m.a.id,
          entrantBId: m.b?.id ?? null,
          result: m.b ? (m.result ?? "A_WINS") : "PENDING",
          reportedAt: m.b ? new Date() : null,
        })),
      });
    }

    // Pod 1: everyone attends. A beats B, C beats D.
    const pod1 = await makePod("Pod 1", 0);
    const eA1 = await prisma.entrant.create({ data: { podId: pod1.id, playerId: a.id } });
    const eB1 = await prisma.entrant.create({ data: { podId: pod1.id, playerId: b.id } });
    const eC1 = await prisma.entrant.create({ data: { podId: pod1.id, playerId: c.id } });
    const eD1 = await prisma.entrant.create({ data: { podId: pod1.id, playerId: d.id } });
    await playSingleRound(pod1.id, [
      { a: eA1, b: eB1, result: "A_WINS" },
      { a: eC1, b: eD1, result: "A_WINS" },
    ]);

    // Pod 2: D skips. A beats B, C gets the bye (odd count -> free win).
    const pod2 = await makePod("Pod 2", 1);
    const eA2 = await prisma.entrant.create({ data: { podId: pod2.id, playerId: a.id } });
    const eB2 = await prisma.entrant.create({ data: { podId: pod2.id, playerId: b.id } });
    const eC2 = await prisma.entrant.create({ data: { podId: pod2.id, playerId: c.id } });
    await playSingleRound(pod2.id, [
      { a: eA2, b: eB2, result: "A_WINS" },
      { a: eC2, b: null },
    ]);

    // Pod 3: only A and D attend. D beats A.
    const pod3 = await makePod("Pod 3", 2);
    const eA3 = await prisma.entrant.create({ data: { podId: pod3.id, playerId: a.id } });
    const eD3 = await prisma.entrant.create({ data: { podId: pod3.id, playerId: d.id } });
    await playSingleRound(pod3.id, [{ a: eA3, b: eD3, result: "B_WINS" }]);

    // Expected: A = 3 pods, 3+3+0 = 6 pts, avg 2.0
    //           B = 2 pods, 0+0    = 0 pts, avg 0.0
    //           C = 2 pods, 3+3    = 6 pts, avg 3.0  <- same total as A, fewer pods
    //           D = 2 pods, 0+3    = 3 pts, avg 1.5
    // So C should rank #1 (highest average) even though A ties C on raw
    // total — this is the property under test.
    const gw = await computeGesamtwertung(tournament.id);
    const byPlayer = new Map(gw.rows.map((r) => [r.playerId, r]));

    expect(byPlayer.get(c.id)).toMatchObject({ eventsPlayed: 2, totalPoints: 6, average: 3 });
    expect(byPlayer.get(a.id)).toMatchObject({ eventsPlayed: 3, totalPoints: 6, average: 2 });
    expect(byPlayer.get(d.id)).toMatchObject({ eventsPlayed: 2, totalPoints: 3, average: 1.5 });
    expect(byPlayer.get(b.id)).toMatchObject({ eventsPlayed: 2, totalPoints: 0, average: 0 });

    expect(gw.rows.map((r) => r.playerId)).toEqual([c.id, a.id, d.id, b.id]);

    // perPod: attended-and-scored-zero must be distinct from never-attended.
    expect(gw.pods.map((p) => p.name)).toEqual(["Pod 1", "Pod 2", "Pod 3"]);
    expect(byPlayer.get(b.id)?.perPod).toEqual({ [pod1.id]: 0, [pod2.id]: 0 }); // never played pod3
    expect(byPlayer.get(b.id)?.perPod[pod3.id]).toBeUndefined();
    expect(byPlayer.get(d.id)?.perPod).toEqual({ [pod1.id]: 0, [pod3.id]: 3 }); // never played pod2
  });

  it("credits each team member the team's full points, matching the confirmed Gesamtwertung rule", async () => {
    const org = await prisma.organization.create({ data: { slug: `gw-team-${Date.now()}`, name: "Test Org" } });
    const tournament = await prisma.tournament.create({
      data: { orgId: org.id, name: "Test Weekend", startDate: new Date(), endDate: new Date() },
    });
    const [p1, p2, p3] = await Promise.all([
      prisma.player.create({ data: { orgId: org.id, displayName: "P1" } }),
      prisma.player.create({ data: { orgId: org.id, displayName: "P2" } }),
      prisma.player.create({ data: { orgId: org.id, displayName: "P3" } }),
    ]);

    const pod = await prisma.pod.create({
      data: {
        tournamentId: tournament.id,
        name: "Team Pod",
        format: "CHAOS_DRAFT",
        sequenceOrder: 0,
        isTeamEvent: true,
        teamSize: 2,
        roundCount: 1,
      },
    });

    const teamA = await prisma.team.create({
      data: { podId: pod.id, name: "P1+P2", members: { create: [{ playerId: p1.id }, { playerId: p2.id }] } },
    });
    const entrantA = await prisma.entrant.create({ data: { podId: pod.id, teamId: teamA.id } });
    const entrantB = await prisma.entrant.create({ data: { podId: pod.id, playerId: p3.id } });

    const round = await prisma.round.create({ data: { podId: pod.id, roundNumber: 1, status: "COMPLETED" } });
    await prisma.match.create({
      data: {
        roundId: round.id,
        tableNumber: 1,
        entrantAId: entrantA.id,
        entrantBId: entrantB.id,
        result: "A_WINS",
        reportedAt: new Date(),
      },
    });

    const gw = await computeGesamtwertung(tournament.id);
    const byPlayer = new Map(gw.rows.map((r) => [r.playerId, r]));

    // Team won (3 pts) -> both P1 and P2 get the FULL 3, not 1.5 each.
    expect(byPlayer.get(p1.id)?.totalPoints).toBe(3);
    expect(byPlayer.get(p2.id)?.totalPoints).toBe(3);
    expect(byPlayer.get(p3.id)?.totalPoints).toBe(0);
  });
});
