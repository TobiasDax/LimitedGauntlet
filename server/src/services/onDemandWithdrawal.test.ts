import { afterAll, describe, expect, it } from "vitest";
import { makePrismaClient } from "../db.js";
import {
  findOnDemandConflicts,
  withdrawFromOtherOnDemandPods,
  restoreOnDemandWithdrawals,
} from "./onDemandWithdrawal.js";

const prisma = makePrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

async function setup() {
  const u = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const org = await prisma.organization.create({ data: { slug: `odw-${u}`, name: "ODW" } });
  const tournament = await prisma.tournament.create({
    data: { orgId: org.id, name: "T", startDate: new Date(), endDate: new Date() },
  });
  const other = await prisma.tournament.create({
    data: { orgId: org.id, name: "T2", startDate: new Date(), endDate: new Date() },
  });
  const player = (name: string) => prisma.player.create({ data: { orgId: org.id, displayName: `${name}-${u}` } });
  return { org, tournament, other, player, u };
}

interface PodOpts {
  isOnDemand?: boolean;
  tournamentId?: string;
  started?: boolean;
  isTeamEvent?: boolean;
}

async function makePod(tournamentId: string, name: string, opts: PodOpts = {}) {
  const pod = await prisma.pod.create({
    data: {
      tournamentId: opts.tournamentId ?? tournamentId,
      name,
      format: "DRAFT",
      sequenceOrder: 0,
      roundCount: 3,
      isOnDemand: opts.isOnDemand ?? true,
      isTeamEvent: opts.isTeamEvent ?? false,
    },
  });
  if (opts.started) {
    await prisma.round.create({ data: { podId: pod.id, roundNumber: 1, status: "ACTIVE" } });
  }
  return pod;
}

async function addPlayer(podId: string, playerId: string) {
  return prisma.entrant.create({ data: { podId, playerId } });
}

async function addTeam(podId: string, teamName: string, playerIds: string[]) {
  const team = await prisma.team.create({
    data: { podId, name: teamName, members: { create: playerIds.map((playerId) => ({ playerId })) } },
  });
  return prisma.entrant.create({ data: { podId, teamId: team.id } });
}

// Runs the in-transaction withdrawal against a freshly-created round-1 row.
async function runWithdraw(startingPodId: string) {
  const round = await prisma.round.create({ data: { podId: startingPodId, roundNumber: 1 } });
  const result = await prisma.$transaction((tx) => withdrawFromOtherOnDemandPods(tx, startingPodId, round.id));
  const stored = await prisma.round.findUniqueOrThrow({ where: { id: round.id } });
  return { ...result, roundId: round.id, record: stored.onDemandWithdrawals };
}

describe("findOnDemandConflicts", () => {
  it("surfaces players shared with other not-yet-started on-demand pods in the same tournament", async () => {
    const { tournament, other, player } = await setup();
    const [alice, bob] = await Promise.all([player("alice"), player("bob")]);

    const podA = await makePod(tournament.id, "A"); // the one starting
    const podB = await makePod(tournament.id, "B"); // shares alice
    const scheduled = await makePod(tournament.id, "S", { isOnDemand: false }); // shares alice, but scheduled
    const started = await makePod(tournament.id, "R", { started: true }); // shares alice, but running
    const elsewhere = await makePod(other.id, "X", { tournamentId: other.id }); // other tournament

    await Promise.all([
      addPlayer(podA.id, alice.id),
      addPlayer(podA.id, bob.id),
      addPlayer(podB.id, alice.id),
      addPlayer(scheduled.id, alice.id),
      addPlayer(started.id, alice.id),
      addPlayer(elsewhere.id, alice.id),
    ]);

    const conflicts = await findOnDemandConflicts(podA.id);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ podId: podB.id, kind: "individual" });
    expect(conflicts[0]!.displayName).toContain("alice");
  });

  it("reports a team entrant that contains a shared player", async () => {
    const { tournament, player } = await setup();
    const [alice, bob, carol] = await Promise.all([player("alice"), player("bob"), player("carol")]);

    const podA = await makePod(tournament.id, "A");
    const podB = await makePod(tournament.id, "B", { isTeamEvent: true });
    await addPlayer(podA.id, alice.id);
    await addTeam(podB.id, "Team Alice", [alice.id, bob.id]);
    await addTeam(podB.id, "Team Carol", [carol.id, bob.id]); // no overlap with podA

    const conflicts = await findOnDemandConflicts(podA.id);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: "team", displayName: "Team Alice" });
    expect(conflicts[0]!.memberNames).toHaveLength(2);
  });

  it("is empty when the starting pod's players are in no other on-demand pod", async () => {
    const { tournament, player } = await setup();
    const alice = await player("alice");
    const podA = await makePod(tournament.id, "A");
    await addPlayer(podA.id, alice.id);
    expect(await findOnDemandConflicts(podA.id)).toEqual([]);
  });
});

describe("withdrawFromOtherOnDemandPods", () => {
  it("hard-deletes the conflicting entrants and records them; leaves everything else", async () => {
    const { tournament, player } = await setup();
    const [alice, bob, carol] = await Promise.all([player("alice"), player("bob"), player("carol")]);

    const podA = await makePod(tournament.id, "A");
    const podB = await makePod(tournament.id, "B", { isTeamEvent: true });
    const podC = await makePod(tournament.id, "C");
    const scheduled = await makePod(tournament.id, "S", { isOnDemand: false });

    await addPlayer(podA.id, alice.id);
    await addTeam(podB.id, "Team Alice", [alice.id, bob.id]);
    await addPlayer(podC.id, carol.id); // no overlap
    await addPlayer(scheduled.id, alice.id); // scheduled — untouched

    const { affectedPodIds, record } = await runWithdraw(podA.id);

    expect(affectedPodIds).toEqual([podB.id]);
    expect(await prisma.entrant.count({ where: { podId: podB.id } })).toBe(0);
    expect(await prisma.team.count({ where: { podId: podB.id } })).toBe(0);
    expect(await prisma.entrant.count({ where: { podId: podC.id } })).toBe(1);
    expect(await prisma.entrant.count({ where: { podId: scheduled.id } })).toBe(1);

    const parsed = record as { version: number; byPod: { podId: string; teams: unknown[] }[] };
    expect(parsed.version).toBe(1);
    expect(parsed.byPod[0]!.podId).toBe(podB.id);
    expect(parsed.byPod[0]!.teams).toHaveLength(1);
  });

  it("no-ops (and stamps nothing) when there are no conflicts", async () => {
    const { tournament, player } = await setup();
    const alice = await player("alice");
    const podA = await makePod(tournament.id, "A");
    await addPlayer(podA.id, alice.id);

    const { affectedPodIds, record } = await runWithdraw(podA.id);
    expect(affectedPodIds).toEqual([]);
    expect(record).toBeNull();
  });
});

describe("restoreOnDemandWithdrawals", () => {
  it("re-adds withdrawn individuals and teams, skipping started pods and already-present players", async () => {
    const { tournament, player } = await setup();
    const [alice, bob, carol, dave] = await Promise.all([
      player("alice"),
      player("bob"),
      player("carol"),
      player("dave"),
    ]);

    const podA = await makePod(tournament.id, "A");
    const podB = await makePod(tournament.id, "B", { isTeamEvent: true });
    const podC = await makePod(tournament.id, "C");

    await addPlayer(podA.id, alice.id);
    await addPlayer(podA.id, carol.id);
    await addTeam(podB.id, "Team Alice", [alice.id, bob.id]);
    await addPlayer(podC.id, carol.id);

    const { record } = await runWithdraw(podA.id);
    expect(await prisma.entrant.count({ where: { podId: podB.id } })).toBe(0);
    expect(await prisma.entrant.count({ where: { podId: podC.id } })).toBe(0);

    // podC has since started, and dave joined podC in the meantime.
    await prisma.round.create({ data: { podId: podC.id, roundNumber: 1, status: "ACTIVE" } });
    await addPlayer(podC.id, dave.id);

    const { restoredPodIds } = await restoreOnDemandWithdrawals(record);

    expect(restoredPodIds).toEqual([podB.id]); // podC skipped (started)
    expect(await prisma.team.count({ where: { podId: podB.id, name: "Team Alice" } })).toBe(1);
    expect(await prisma.entrant.count({ where: { podId: podB.id } })).toBe(1);
    expect(await prisma.entrant.count({ where: { podId: podC.id } })).toBe(1); // just dave
  });

  it("tolerates a malformed / empty record", async () => {
    expect(await restoreOnDemandWithdrawals(null)).toEqual({ restoredPodIds: [] });
    expect(await restoreOnDemandWithdrawals({ nope: true })).toEqual({ restoredPodIds: [] });
  });
});
