import { prisma } from "../prisma.js";
import { computePodStandings } from "./standings.js";

export interface HallOfFameRow {
  playerId: string;
  tournamentsPlayed: number;
  podsPlayed: number;
  totalPoints: number;
  average: number;
}

// The all-time player leaderboard across every tournament this org has ever
// run — the org-wide analogue of a single weekend's Gesamtwertung. Same
// scoring rules on purpose (see gesamtwertung.ts / PLAN.md): team pods credit
// each member the FULL pod points (not divided), and players are ranked by
// average points per pod played rather than raw total, so attending fewer
// events isn't penalized.
export async function computeHallOfFame(orgId: string): Promise<HallOfFameRow[]> {
  const pods = await prisma.pod.findMany({
    where: { tournament: { orgId } },
    // PI-6 (per-pod excludeFromStats) would add a filter here once it exists.
    include: { entrants: { include: { team: { include: { members: true } } } } },
  });

  const totals = new Map<string, number>();
  const podsPlayed = new Map<string, number>();
  const tournamentsByPlayer = new Map<string, Set<string>>();

  for (const pod of pods) {
    if (pod.entrants.length === 0) continue; // unplayed/empty pod — nothing to credit
    const standings = await computePodStandings(pod.id);
    const pointsByEntrant = new Map(standings.map((s) => [s.entrantId, s.points]));

    for (const entrant of pod.entrants) {
      const points = pointsByEntrant.get(entrant.id) ?? 0;
      const playerIds = entrant.playerId ? [entrant.playerId] : (entrant.team?.members.map((m) => m.playerId) ?? []);

      for (const playerId of playerIds) {
        totals.set(playerId, (totals.get(playerId) ?? 0) + points);
        podsPlayed.set(playerId, (podsPlayed.get(playerId) ?? 0) + 1);
        if (!tournamentsByPlayer.has(playerId)) tournamentsByPlayer.set(playerId, new Set());
        tournamentsByPlayer.get(playerId)!.add(pod.tournamentId);
      }
    }
  }

  const playerIds = [...totals.keys()];
  const players = await prisma.player.findMany({ where: { id: { in: playerIds } } });
  const nameById = new Map(players.map((p) => [p.id, p.displayName]));

  const rows: HallOfFameRow[] = playerIds.map((playerId) => {
    const played = podsPlayed.get(playerId) ?? 0;
    const total = totals.get(playerId) ?? 0;
    return {
      playerId,
      tournamentsPlayed: tournamentsByPlayer.get(playerId)?.size ?? 0,
      podsPlayed: played,
      totalPoints: total,
      average: played > 0 ? total / played : 0,
    };
  });

  rows.sort(
    (a, b) =>
      b.average - a.average ||
      b.totalPoints - a.totalPoints ||
      (nameById.get(a.playerId) ?? "").localeCompare(nameById.get(b.playerId) ?? ""),
  );

  return rows;
}
