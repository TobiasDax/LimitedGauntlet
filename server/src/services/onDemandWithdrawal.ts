import type { Prisma } from "../db.js";
import { prisma } from "../prisma.js";
import { podIsPlayed } from "./standings.js";

// PI-100 — on-demand side events. When an on-demand pod's round 1 is generated,
// every entrant in it is (optionally, the organizer chooses at the modal) pulled
// out of every *other* not-yet-started on-demand pod in the same tournament:
// they're now busy playing and can't fill anything else. Scheduled pods and
// started/finished pods are never touched, and the withdraw is scoped to the
// one tournament.

export interface OnDemandConflict {
  podId: string;
  podName: string;
  entrantId: string;
  kind: "individual" | "team";
  // The entrant's display name — the player's name, or the team's name.
  displayName: string;
  // Team members' names, for the "removes the whole team" modal copy.
  memberNames?: string[];
}

interface WithdrawnPodRecord {
  podId: string;
  podName: string;
  individuals: { playerId: string; displayName: string }[];
  teams: { teamName: string; displayName: string; memberPlayerIds: string[] }[];
}

export interface OnDemandWithdrawalRecord {
  version: 1;
  byPod: WithdrawnPodRecord[];
}

type PodWithEntrants = Prisma.PodGetPayload<{
  include: {
    rounds: { select: { id: true } };
    entrants: {
      include: {
        player: true;
        team: { include: { members: { include: { player: true } } } };
      };
    };
  };
}>;

const siblingInclude = {
  rounds: { select: { id: true } },
  entrants: {
    include: {
      player: true,
      team: { include: { members: { include: { player: true } } } },
    },
  },
} satisfies Prisma.PodInclude;

function playerIdsOfEntrant(entrant: PodWithEntrants["entrants"][number]): string[] {
  if (entrant.playerId) return [entrant.playerId];
  return entrant.team?.members.map((m) => m.playerId) ?? [];
}

function entrantDisplayName(entrant: PodWithEntrants["entrants"][number]): string {
  if (entrant.player) return entrant.player.displayName;
  return entrant.team?.name ?? "—";
}

// The players who'd be busy once `startingPodId` starts: every playerId that
// appears in any of its entrants (direct or as a team member).
async function busyPlayerIds(
  db: Prisma.TransactionClient | typeof prisma,
  startingPodId: string,
): Promise<{ tournamentId: string; playerIds: Set<string> } | null> {
  const pod = await db.pod.findUnique({
    where: { id: startingPodId },
    include: {
      entrants: { include: { team: { select: { members: { select: { playerId: true } } } } } },
    },
  });
  if (!pod) return null;
  const playerIds = new Set<string>();
  for (const e of pod.entrants) {
    if (e.playerId) playerIds.add(e.playerId);
    for (const m of e.team?.members ?? []) playerIds.add(m.playerId);
  }
  return { tournamentId: pod.tournamentId, playerIds };
}

async function conflictingSiblings(
  db: Prisma.TransactionClient | typeof prisma,
  startingPodId: string,
): Promise<{ pod: PodWithEntrants; entrants: PodWithEntrants["entrants"] }[]> {
  const busy = await busyPlayerIds(db, startingPodId);
  if (!busy || busy.playerIds.size === 0) return [];

  const siblings = (await db.pod.findMany({
    where: { tournamentId: busy.tournamentId, isOnDemand: true, id: { not: startingPodId } },
    include: siblingInclude,
  })) as PodWithEntrants[];

  const out: { pod: PodWithEntrants; entrants: PodWithEntrants["entrants"] }[] = [];
  for (const sibling of siblings) {
    // `podIsPlayed` wants `{ status, rounds }` — sibling carries both.
    if (podIsPlayed(sibling)) continue;
    const hits = sibling.entrants.filter((e) => playerIdsOfEntrant(e).some((id) => busy.playerIds.has(id)));
    if (hits.length > 0) out.push({ pod: sibling, entrants: hits });
  }
  return out;
}

// Read-only: what a "withdraw" would remove. Drives the confirm modal.
export async function findOnDemandConflicts(startingPodId: string): Promise<OnDemandConflict[]> {
  const siblings = await conflictingSiblings(prisma, startingPodId);
  const conflicts: OnDemandConflict[] = [];
  for (const { pod, entrants } of siblings) {
    for (const e of entrants) {
      conflicts.push({
        podId: pod.id,
        podName: pod.name,
        entrantId: e.id,
        kind: e.team ? "team" : "individual",
        displayName: entrantDisplayName(e),
        memberNames: e.team?.members.map((m) => m.player.displayName),
      });
    }
  }
  return conflicts;
}

// Runs INSIDE the round-1 transaction. Re-derives the conflicts against `tx`
// (so nothing added between the modal and the confirm slips through), hard-
// deletes the conflicting entrants — a team entrant goes whole, via the Team
// row, exactly like `DELETE /api/entrants/:id` — stamps the withdrawal record
// onto `roundId` (for the un-pair restore path), and returns the affected pod
// ids for post-commit events.
export async function withdrawFromOtherOnDemandPods(
  tx: Prisma.TransactionClient,
  startingPodId: string,
  roundId: string,
): Promise<{ affectedPodIds: string[] }> {
  const siblings = await conflictingSiblings(tx, startingPodId);
  if (siblings.length === 0) return { affectedPodIds: [] };

  const byPod: WithdrawnPodRecord[] = [];
  for (const { pod, entrants } of siblings) {
    const individuals: WithdrawnPodRecord["individuals"] = [];
    const teams: WithdrawnPodRecord["teams"] = [];
    for (const e of entrants) {
      if (e.team) {
        teams.push({
          teamName: e.team.name,
          displayName: e.team.name,
          memberPlayerIds: e.team.members.map((m) => m.playerId),
        });
        await tx.team.delete({ where: { id: e.team.id } });
      } else if (e.playerId) {
        individuals.push({ playerId: e.playerId, displayName: entrantDisplayName(e) });
        await tx.entrant.delete({ where: { id: e.id } });
      }
    }
    byPod.push({ podId: pod.id, podName: pod.name, individuals, teams });
  }

  const record: OnDemandWithdrawalRecord = { version: 1, byPod };
  await tx.round.update({
    where: { id: roundId },
    data: { onDemandWithdrawals: record as unknown as Prisma.InputJsonValue },
  });
  return { affectedPodIds: byPod.map((p) => p.podId) };
}

function isRecord(value: unknown): value is OnDemandWithdrawalRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version === 1 &&
    Array.isArray((value as { byPod?: unknown }).byPod)
  );
}

// Best-effort re-add when a pod's round 1 is un-paired (PI-56). Never throws —
// a target pod may be gone, may have started since, or the player may already
// be back in it. Returns the pods it actually changed, for realtime events.
export async function restoreOnDemandWithdrawals(raw: unknown): Promise<{ restoredPodIds: string[] }> {
  if (!isRecord(raw)) return { restoredPodIds: [] };
  const restored: string[] = [];

  for (const entry of raw.byPod) {
    const pod = await prisma.pod.findUnique({
      where: { id: entry.podId },
      include: {
        rounds: { select: { id: true } },
        entrants: { include: { team: { select: { members: { select: { playerId: true } } } } } },
      },
    });
    if (!pod || podIsPlayed(pod)) continue;

    const present = new Set<string>();
    for (const e of pod.entrants) {
      if (e.playerId) present.add(e.playerId);
      for (const m of e.team?.members ?? []) present.add(m.playerId);
    }

    let changed = false;

    for (const ind of entry.individuals ?? []) {
      if (present.has(ind.playerId)) continue;
      const player = await prisma.player.findUnique({ where: { id: ind.playerId }, select: { id: true } });
      if (!player) continue;
      await prisma.entrant.create({ data: { podId: pod.id, playerId: ind.playerId } });
      present.add(ind.playerId);
      changed = true;
    }

    for (const team of entry.teams ?? []) {
      const memberIds = team.memberPlayerIds ?? [];
      if (memberIds.length === 0 || memberIds.some((id) => present.has(id))) continue;
      const players = await prisma.player.findMany({ where: { id: { in: memberIds } }, select: { id: true } });
      if (players.length !== memberIds.length) continue;
      // Team then entrant, mirroring the team-add path in routes/pods.ts.
      const created = await prisma.team.create({
        data: { podId: pod.id, name: team.teamName, members: { create: memberIds.map((playerId) => ({ playerId })) } },
      });
      await prisma.entrant.create({ data: { podId: pod.id, teamId: created.id } });
      for (const id of memberIds) present.add(id);
      changed = true;
    }

    if (changed) restored.push(pod.id);
  }

  return { restoredPodIds: restored };
}
