import { prisma } from "../prisma.js";
import { computeAllPodStats } from "./podStats.js";

export interface StandingsRow {
  entrantId: string;
  points: number;
  matchWinPct: number;
  gameWinPct: number;
  opponentsMatchWinPct: number;
  opponentsGameWinPct: number;
}

// MTR: an opponent's win percentage is never used as less than 33% when
// computing someone else's OMW%/OGW% — otherwise a single opponent who
// went 0-3 unfairly tanks everyone they played against.
const OPPONENT_FLOOR = 1 / 3;

export async function computePodStandings(podId: string): Promise<StandingsRow[]> {
  const [pod, entrants, stats] = await Promise.all([
    prisma.pod.findUniqueOrThrow({ where: { id: podId } }),
    prisma.entrant.findMany({ where: { podId } }),
    computeAllPodStats(podId),
  ]);

  const matchWinPct = new Map<string, number>();
  const gameWinPct = new Map<string, number>();
  for (const entrant of entrants) {
    const mp = stats.matchesPlayed.get(entrant.id) ?? 0;
    matchWinPct.set(entrant.id, mp > 0 ? (stats.points.get(entrant.id) ?? 0) / (mp * pod.pointsWin) : 0);
    const gp = stats.gamesPlayed.get(entrant.id) ?? 0;
    gameWinPct.set(entrant.id, gp > 0 ? (stats.gamesWon.get(entrant.id) ?? 0) / gp : 0);
  }

  const rows: StandingsRow[] = entrants.map((entrant) => {
    const opponents = [...(stats.opponents.get(entrant.id) ?? [])];
    const average = (table: Map<string, number>) =>
      opponents.length > 0
        ? opponents.reduce((sum, oid) => sum + Math.max(table.get(oid) ?? 0, OPPONENT_FLOOR), 0) / opponents.length
        : 0;

    return {
      entrantId: entrant.id,
      points: stats.points.get(entrant.id) ?? 0,
      matchWinPct: matchWinPct.get(entrant.id) ?? 0,
      gameWinPct: gameWinPct.get(entrant.id) ?? 0,
      opponentsMatchWinPct: average(matchWinPct),
      opponentsGameWinPct: average(gameWinPct),
    };
  });

  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.opponentsMatchWinPct - a.opponentsMatchWinPct ||
      b.gameWinPct - a.gameWinPct ||
      b.opponentsGameWinPct - a.opponentsGameWinPct,
  );

  return rows;
}
