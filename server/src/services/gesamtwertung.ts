import { prisma } from "../prisma.js";
import { computePodStandings } from "./standings.js";

export interface GesamtwertungPod {
  id: string;
  name: string;
  sequenceOrder: number;
}

export interface GesamtwertungRow {
  playerId: string;
  eventsPlayed: number;
  totalPoints: number;
  average: number;
  // Points earned in each pod, keyed by pod id. Absent from the map (not
  // zero) means the player never had an entrant in that pod — distinct
  // from attending and scoring zero.
  perPod: Record<string, number>;
}

export interface GesamtwertungResult {
  pods: GesamtwertungPod[];
  rows: GesamtwertungRow[];
}

interface EntrantForParticipation {
  playerId: string | null;
  team: { members: { playerId: string }[] } | null;
}

// Distinct players who actually appear as an entrant in at least one of
// these pods — the same "did they actually play" concept computeGesamtwertung
// filters on below (PI-60), reused wherever a tournament needs a real
// participation count instead of its raw TournamentPlayer registration count.
export function countTournamentParticipants(pods: { entrants: EntrantForParticipation[] }[]): number {
  const ids = new Set<string>();
  for (const pod of pods) {
    for (const entrant of pod.entrants) {
      if (entrant.playerId) ids.add(entrant.playerId);
      else for (const m of entrant.team?.members ?? []) ids.add(m.playerId);
    }
  }
  return ids.size;
}

// The weekend "overall" table: for each player attending the tournament,
// sum their match points across every pod they played (team pods credit
// the FULL team score to each member, not divided — confirmed against
// real 2025 Sommer data, see PLAN.md), then rank by average points per
// pod played rather than raw total, so partial attendance isn't
// penalized (e.g. someone who only made Saturday).
export async function computeGesamtwertung(tournamentId: string): Promise<GesamtwertungResult> {
  const [tournamentPlayers, pods] = await Promise.all([
    prisma.tournamentPlayer.findMany({ where: { tournamentId } }),
    prisma.pod.findMany({
      where: { tournamentId },
      orderBy: { sequenceOrder: "asc" },
      include: { entrants: { include: { team: { include: { members: true } } } } },
    }),
  ]);

  const totals = new Map<string, number>();
  const eventsPlayed = new Map<string, number>();
  const perPod = new Map<string, Record<string, number>>();
  for (const tp of tournamentPlayers) {
    totals.set(tp.playerId, 0);
    eventsPlayed.set(tp.playerId, 0);
    perPod.set(tp.playerId, {});
  }

  for (const pod of pods) {
    const standings = await computePodStandings(pod.id);
    const pointsByEntrant = new Map(standings.map((s) => [s.entrantId, s.points]));

    for (const entrant of pod.entrants) {
      const points = pointsByEntrant.get(entrant.id) ?? 0;
      const playerIds = entrant.playerId ? [entrant.playerId] : (entrant.team?.members.map((m) => m.playerId) ?? []);

      for (const playerId of playerIds) {
        totals.set(playerId, (totals.get(playerId) ?? 0) + points);
        eventsPlayed.set(playerId, (eventsPlayed.get(playerId) ?? 0) + 1);
        if (!perPod.has(playerId)) perPod.set(playerId, {});
        perPod.get(playerId)![pod.id] = points;
      }
    }
  }

  // Only players who actually played at least one pod — a registered
  // attendee who never took a seat anywhere shouldn't clutter a table
  // that's meant to rank performance (PI-60).
  const playerIds = [...totals.keys()].filter((id) => (eventsPlayed.get(id) ?? 0) > 0);
  const players = await prisma.player.findMany({ where: { id: { in: playerIds } } });
  const nameById = new Map(players.map((p) => [p.id, p.displayName]));

  const rows: GesamtwertungRow[] = playerIds.map((playerId) => {
    const events = eventsPlayed.get(playerId) ?? 0;
    const total = totals.get(playerId) ?? 0;
    return {
      playerId,
      eventsPlayed: events,
      totalPoints: total,
      average: events > 0 ? total / events : 0,
      perPod: perPod.get(playerId) ?? {},
    };
  });

  rows.sort(
    (a, b) =>
      b.average - a.average ||
      b.totalPoints - a.totalPoints ||
      (nameById.get(a.playerId) ?? "").localeCompare(nameById.get(b.playerId) ?? ""),
  );

  return {
    pods: pods.map((p) => ({ id: p.id, name: p.name, sequenceOrder: p.sequenceOrder })),
    rows,
  };
}
