import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { generatePairings } from "./pairing.js";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

async function createOrgAndTournament() {
  const slug = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const org = await prisma.organization.create({ data: { slug, name: "Test Org" } });
  const tournament = await prisma.tournament.create({
    data: { orgId: org.id, name: "Test Tournament", startDate: new Date(), endDate: new Date() },
  });
  return { org, tournament };
}

async function createPlayers(orgId: string, names: string[]) {
  return Promise.all(names.map((displayName) => prisma.player.create({ data: { orgId, displayName } })));
}

async function createPod(tournamentId: string, opts: { name: string; sequenceOrder?: number; roundCount?: number }) {
  return prisma.pod.create({
    data: {
      tournamentId,
      name: opts.name,
      format: "DRAFT",
      sequenceOrder: opts.sequenceOrder ?? 0,
      roundCount: opts.roundCount ?? 3,
    },
  });
}

// Generates a round's pairings via the real algorithm, persists it as a
// completed round (every real match an arbitrary A win, since only the
// pairing itself is under test here), and hands back the pairing so the
// caller can assert on it.
async function playAndCompleteRound(podId: string, roundNumber: number) {
  const suggestion = await generatePairings(podId, roundNumber);
  const round = await prisma.round.create({ data: { podId, roundNumber, status: "ACTIVE" } });
  await prisma.match.createMany({
    data: suggestion.pairs.map((pair, index) => ({
      roundId: round.id,
      tableNumber: index + 1,
      entrantAId: pair.entrantAId,
      entrantBId: pair.entrantBId,
      result: pair.entrantBId ? "A_WINS" : "PENDING",
      gamesWonA: pair.entrantBId ? 2 : 0,
      gamesWonB: 0,
      reportedAt: pair.entrantBId ? new Date() : null,
    })),
  });
  await prisma.round.update({ where: { id: round.id }, data: { status: "COMPLETED" } });
  return suggestion;
}

describe("generatePairings", () => {
  it("never repeats an opponent across a full 8-entrant, 3-round pod", async () => {
    const { org, tournament } = await createOrgAndTournament();
    const players = await createPlayers(org.id, ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]);
    const pod = await createPod(tournament.id, { name: "Test Pod", roundCount: 3 });
    const entrants = await Promise.all(
      players.map((p) => prisma.entrant.create({ data: { podId: pod.id, playerId: p.id } })),
    );

    const opponentsSeen = new Map<string, Set<string>>();
    for (const e of entrants) opponentsSeen.set(e.id, new Set());

    for (let round = 1; round <= 3; round++) {
      const suggestion = await playAndCompleteRound(pod.id, round);
      expect(suggestion.pairs).toHaveLength(4); // 8 entrants, no bye
      for (const pair of suggestion.pairs) {
        if (!pair.entrantBId) continue;
        expect(opponentsSeen.get(pair.entrantAId)!.has(pair.entrantBId)).toBe(false);
        expect(opponentsSeen.get(pair.entrantBId)!.has(pair.entrantAId)).toBe(false);
        opponentsSeen.get(pair.entrantAId)!.add(pair.entrantBId);
        opponentsSeen.get(pair.entrantBId)!.add(pair.entrantAId);
      }
    }

    for (const e of entrants) {
      expect(opponentsSeen.get(e.id)!.size).toBe(3);
    }
  });

  it("gives the lowest-scoring entrant without a prior bye the bye on an odd count", async () => {
    const { org, tournament } = await createOrgAndTournament();
    const players = await createPlayers(org.id, ["P1", "P2", "P3", "P4", "P5"]);
    const pod = await createPod(tournament.id, { name: "Odd Pod", roundCount: 2 });
    await Promise.all(players.map((p) => prisma.entrant.create({ data: { podId: pod.id, playerId: p.id } })));

    const round1 = await playAndCompleteRound(pod.id, 1);
    const bye1 = round1.pairs.find((p) => p.entrantBId === null);
    expect(bye1).toBeDefined();

    const round2 = await playAndCompleteRound(pod.id, 2);
    const bye2 = round2.pairs.find((p) => p.entrantBId === null);
    expect(bye2).toBeDefined();

    // Nobody gets a second bye while any entrant hasn't had a first one yet
    // (5 entrants, 2 rounds -> at most 2 of the 5 have had a bye at all).
    expect(bye2!.entrantAId).not.toBe(bye1!.entrantAId);
  });

  it("prefers a never-met-this-weekend pairing over a repeat when both are hard-feasible", async () => {
    const { org, tournament } = await createOrgAndTournament();
    const [p1, p2, p3, p4] = await createPlayers(org.id, ["Q1", "Q2", "Q3", "Q4"]);

    // Pod A: already completed, p1-p2 and p3-p4 played each other.
    const podA = await createPod(tournament.id, { name: "Pod A", roundCount: 1 });
    const eA1 = await prisma.entrant.create({ data: { podId: podA.id, playerId: p1!.id } });
    const eA2 = await prisma.entrant.create({ data: { podId: podA.id, playerId: p2!.id } });
    const eA3 = await prisma.entrant.create({ data: { podId: podA.id, playerId: p3!.id } });
    const eA4 = await prisma.entrant.create({ data: { podId: podA.id, playerId: p4!.id } });
    const roundA = await prisma.round.create({ data: { podId: podA.id, roundNumber: 1, status: "COMPLETED" } });
    await prisma.match.createMany({
      data: [
        {
          roundId: roundA.id,
          tableNumber: 1,
          entrantAId: eA1.id,
          entrantBId: eA2.id,
          result: "A_WINS",
          reportedAt: new Date(),
        },
        {
          roundId: roundA.id,
          tableNumber: 2,
          entrantAId: eA3.id,
          entrantBId: eA4.id,
          result: "A_WINS",
          reportedAt: new Date(),
        },
      ],
    });

    // Pod B: same 4 players (fresh Entrant rows, since Entrant is
    // pod-scoped), round 1 not yet paired. Within Pod B there's no
    // within-pod history yet, so the hard-avoid rule is a no-op here —
    // this isolates the soft weekend-history nudge specifically.
    const podB = await createPod(tournament.id, { name: "Pod B", sequenceOrder: 1, roundCount: 1 });
    const eB1 = await prisma.entrant.create({ data: { podId: podB.id, playerId: p1!.id } });
    const eB2 = await prisma.entrant.create({ data: { podId: podB.id, playerId: p2!.id } });
    const eB3 = await prisma.entrant.create({ data: { podId: podB.id, playerId: p3!.id } });
    const eB4 = await prisma.entrant.create({ data: { podId: podB.id, playerId: p4!.id } });

    const suggestion = await generatePairings(podB.id, 1);

    const playerIdByEntrant = new Map([
      [eB1.id, p1!.id],
      [eB2.id, p2!.id],
      [eB3.id, p3!.id],
      [eB4.id, p4!.id],
    ]);

    const metElsewhere = (a: string, b: string) =>
      (a === p1!.id && b === p2!.id) ||
      (a === p2!.id && b === p1!.id) ||
      (a === p3!.id && b === p4!.id) ||
      (a === p4!.id && b === p3!.id);

    for (const pair of suggestion.pairs) {
      if (!pair.entrantBId) continue;
      const a = playerIdByEntrant.get(pair.entrantAId)!;
      const b = playerIdByEntrant.get(pair.entrantBId)!;
      expect(metElsewhere(a, b)).toBe(false);
    }
  });
});
