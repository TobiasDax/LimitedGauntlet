import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  getPlayerTokenBalance,
  recordManualTokenTxn,
  resolvePodTokenConfig,
  standingBonusFor,
  syncPodTokenAwards,
} from "./tokens.js";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

async function setup(opts?: { tokensEnabled?: boolean }) {
  const u = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const org = await prisma.organization.create({
    data: { slug: `tok-${u}`, name: "Tok", tokensEnabled: opts?.tokensEnabled ?? true },
  });
  const organizer = await prisma.organizerAccount.create({
    data: { orgId: org.id, name: "Org", email: `o-${u}@x.com`, passwordHash: "x" },
  });
  const tournament = await prisma.tournament.create({
    data: {
      orgId: org.id,
      name: "T",
      startDate: new Date(),
      endDate: new Date(),
      tokenParticipation: 5,
      tokenStandingBonuses: [
        { fromPlace: 1, toPlace: 1, tokens: 10 },
        { fromPlace: 2, toPlace: 2, tokens: 5 },
        { fromPlace: 3, toPlace: 4, tokens: 1 },
      ],
    },
  });
  return { org, organizer, tournament, u };
}

// Builds a completed 1-round pod with the given player names as entrants,
// results set so standings order matches `names` order (name[0] wins).
async function completedPod(tournamentId: string, names: string[], podOverrides?: object) {
  const org = (await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } })).orgId;
  const players = await Promise.all(names.map((n) => prisma.player.create({ data: { orgId: org, displayName: `${n}-${Math.random()}` } })));
  const pod = await prisma.pod.create({
    data: { tournamentId, name: `Pod-${Math.random()}`, format: "DRAFT", sequenceOrder: 0, roundCount: 1, ...podOverrides },
  });
  const entrants = await Promise.all(players.map((p) => prisma.entrant.create({ data: { podId: pod.id, playerId: p.id } })));
  const round = await prisma.round.create({ data: { podId: pod.id, roundNumber: 1, status: "ACTIVE" } });
  // pair 0v1, 2v3, ... ; earlier index wins → higher standing
  for (let i = 0; i + 1 < entrants.length; i += 2) {
    await prisma.match.create({
      data: {
        roundId: round.id,
        tableNumber: i / 2 + 1,
        entrantAId: entrants[i]!.id,
        entrantBId: entrants[i + 1]!.id,
        result: "A_WINS",
        gamesWonA: 2,
        reportedAt: new Date(),
      },
    });
  }
  await prisma.round.update({ where: { id: round.id }, data: { status: "COMPLETED" } });
  return { pod, players, round };
}

describe("standingBonusFor", () => {
  const bonuses = [
    { fromPlace: 1, toPlace: 1, tokens: 10 },
    { fromPlace: 2, toPlace: 3, tokens: 3 },
  ];
  it("returns the first containing row's tokens", () => {
    expect(standingBonusFor(1, bonuses)).toBe(10);
    expect(standingBonusFor(2, bonuses)).toBe(3);
    expect(standingBonusFor(3, bonuses)).toBe(3);
  });
  it("returns 0 outside every row", () => {
    expect(standingBonusFor(4, bonuses)).toBe(0);
    expect(standingBonusFor(1, [])).toBe(0);
  });
});

describe("resolvePodTokenConfig", () => {
  const tournament = { tokenParticipation: 5, tokenStandingBonuses: [{ fromPlace: 1, toPlace: 1, tokens: 10 }] };
  it("inherits when the pod fields are null", () => {
    const cfg = resolvePodTokenConfig({ tokenParticipation: null, tokenStandingBonuses: null }, tournament);
    expect(cfg.participation).toBe(5);
    expect(cfg.bonuses).toEqual(tournament.tokenStandingBonuses);
  });
  it("overrides each field independently", () => {
    const cfg = resolvePodTokenConfig({ tokenParticipation: 2, tokenStandingBonuses: [] }, tournament);
    expect(cfg.participation).toBe(2);
    expect(cfg.bonuses).toEqual([]);
  });
});

describe("syncPodTokenAwards", () => {
  it("awards participation + standing on a completed pod", async () => {
    const { org, tournament } = await setup();
    const { pod, players } = await completedPod(tournament.id, ["A", "B"]);
    await syncPodTokenAwards(pod.id);

    // A: 1st → +5 participation +10 standing = 15; B: 2nd → +5 +5 = 10
    expect(await getPlayerTokenBalance(org.id, players[0]!.id)).toBe(15);
    expect(await getPlayerTokenBalance(org.id, players[1]!.id)).toBe(10);
  });

  it("credits every member of a team entrant", async () => {
    const { org, tournament } = await setup();
    const p1 = await prisma.player.create({ data: { orgId: org.id, displayName: `m1-${Math.random()}` } });
    const p2 = await prisma.player.create({ data: { orgId: org.id, displayName: `m2-${Math.random()}` } });
    const opp = await prisma.player.create({ data: { orgId: org.id, displayName: `opp-${Math.random()}` } });
    const pod = await prisma.pod.create({
      data: { tournamentId: tournament.id, name: `TP-${Math.random()}`, format: "DRAFT", sequenceOrder: 0, roundCount: 1, isTeamEvent: true, teamSize: 2 },
    });
    const team = await prisma.team.create({
      data: { podId: pod.id, name: "Team", members: { create: [{ playerId: p1.id }, { playerId: p2.id }] } },
    });
    const eTeam = await prisma.entrant.create({ data: { podId: pod.id, teamId: team.id } });
    const eOpp = await prisma.entrant.create({ data: { podId: pod.id, playerId: opp.id } });
    const round = await prisma.round.create({ data: { podId: pod.id, roundNumber: 1, status: "ACTIVE" } });
    await prisma.match.create({
      data: { roundId: round.id, tableNumber: 1, entrantAId: eTeam.id, entrantBId: eOpp.id, result: "A_WINS", gamesWonA: 2, reportedAt: new Date() },
    });
    await prisma.round.update({ where: { id: round.id }, data: { status: "COMPLETED" } });

    await syncPodTokenAwards(pod.id);
    expect(await getPlayerTokenBalance(org.id, p1.id)).toBe(15);
    expect(await getPlayerTokenBalance(org.id, p2.id)).toBe(15);
  });

  it("recomputes when standings change", async () => {
    const { org, tournament } = await setup();
    const { pod, players, round } = await completedPod(tournament.id, ["A", "B"]);
    await syncPodTokenAwards(pod.id);
    expect(await getPlayerTokenBalance(org.id, players[0]!.id)).toBe(15);

    // Flip the result: B now wins → B is 1st, A is 2nd.
    const match = await prisma.match.findFirstOrThrow({ where: { roundId: round.id } });
    await prisma.match.update({ where: { id: match.id }, data: { result: "B_WINS", gamesWonA: 0, gamesWonB: 2 } });
    await syncPodTokenAwards(pod.id);

    expect(await getPlayerTokenBalance(org.id, players[0]!.id)).toBe(10); // 2nd
    expect(await getPlayerTokenBalance(org.id, players[1]!.id)).toBe(15); // 1st
  });

  it("removes all auto rows when the pod is no longer complete", async () => {
    const { org, tournament } = await setup();
    const { pod, players, round } = await completedPod(tournament.id, ["A", "B"]);
    await syncPodTokenAwards(pod.id);
    expect(await getPlayerTokenBalance(org.id, players[0]!.id)).toBe(15);

    await prisma.round.update({ where: { id: round.id }, data: { status: "ACTIVE" } });
    await syncPodTokenAwards(pod.id);
    expect(await getPlayerTokenBalance(org.id, players[0]!.id)).toBe(0);
    expect(await getPlayerTokenBalance(org.id, players[1]!.id)).toBe(0);
  });

  it("is a no-op for an org with tokens disabled", async () => {
    const { org, tournament } = await setup({ tokensEnabled: false });
    const { pod, players } = await completedPod(tournament.id, ["A", "B"]);
    await syncPodTokenAwards(pod.id);
    expect(await getPlayerTokenBalance(org.id, players[0]!.id)).toBe(0);

    // Turning it on and re-running produces the awards.
    await prisma.organization.update({ where: { id: org.id }, data: { tokensEnabled: true } });
    await syncPodTokenAwards(pod.id);
    expect(await getPlayerTokenBalance(org.id, players[0]!.id)).toBe(15);
  });
});

describe("recordManualTokenTxn", () => {
  it("adds a delta and sets a balance", async () => {
    const { org, organizer } = await setup();
    const player = await prisma.player.create({ data: { orgId: org.id, displayName: `p-${Math.random()}` } });

    await recordManualTokenTxn(org.id, player.id, organizer.id, { delta: 40, note: "seed" });
    expect(await getPlayerTokenBalance(org.id, player.id)).toBe(40);

    await recordManualTokenTxn(org.id, player.id, organizer.id, { delta: -15, note: "prize" });
    expect(await getPlayerTokenBalance(org.id, player.id)).toBe(25);

    const { balance } = await recordManualTokenTxn(org.id, player.id, organizer.id, { setTo: 100 });
    expect(balance).toBe(100);
    expect(await getPlayerTokenBalance(org.id, player.id)).toBe(100);
  });

  it("rejects when tokens are disabled", async () => {
    const { org, organizer } = await setup({ tokensEnabled: false });
    const player = await prisma.player.create({ data: { orgId: org.id, displayName: `p-${Math.random()}` } });
    await expect(recordManualTokenTxn(org.id, player.id, organizer.id, { delta: 10 })).rejects.toThrow("tokens_disabled");
  });
});
