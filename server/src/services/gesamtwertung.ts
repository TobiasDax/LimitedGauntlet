import { prisma } from "../prisma.js";
import { computePodStandings } from "./standings.js";

export interface GesamtwertungRow {
  playerId: string;
  eventsPlayed: number;
  totalPoints: number;
  average: number;
}

// The weekend "overall" table: for each player attending the tournament,
// sum their match points across every pod they played (team pods credit
// the FULL team score to each member, not divided — confirmed against
// real 2025 Sommer data, see PLAN.md), then rank by average points per
// pod played rather than raw total, so partial attendance isn't
// penalized (e.g. someone who only made Saturday).
export async function computeGesamtwertung(tournamentId: string): Promise<GesamtwertungRow[]> {
  const [tournamentPlayers, pods] = await Promise.all([
    prisma.tournamentPlayer.findMany({ where: { tournamentId } }),
    prisma.pod.findMany({
      where: { tournamentId },
      include: { entrants: { include: { team: { include: { members: true } } } } },
    }),
  ]);

  const totals = new Map<string, number>();
  const eventsPlayed = new Map<string, number>();
  for (const tp of tournamentPlayers) {
    totals.set(tp.playerId, 0);
    eventsPlayed.set(tp.playerId, 0);
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
      }
    }
  }

  const playerIds = [...totals.keys()];
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
