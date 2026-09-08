import type { PodStatus } from "@prisma/client";
import { prisma } from "../prisma.js";
import { computeAllPodStats } from "./podStats.js";

// "Has this pod actually been played?" — the shared gate for every stat that
// means participation or performance rather than roster assignment. A pod
// counts once it's underway (at least one round has been generated — you
// can't pair a pod without starting it) or finished (`status === COMPLETED`,
// which also covers points-only imported historical pods that never had
// Round rows). A pod still in SETUP with entrants pre-assigned but no rounds
// does NOT count — treating "has an entrant row" as "played" was PI-99's
// bug: not-yet-started pods reading as "N players played", a SETUP main
// event minting a phantom champion, and empty Gesamtwertung columns.
// Mirrors the frontend's `podProgressStatus()` "Setup" test. Canceled pods
// are already excluded upstream via `excludeFromStats` (PI-84).
export function podIsPlayed(pod: { status: PodStatus; rounds: readonly unknown[] }): boolean {
  return pod.rounds.length > 0 || pod.status === "COMPLETED";
}

export interface StandingsRow {
  entrantId: string;
  points: number;
  matchWinPct: number;
  gameWinPct: number;
  opponentsMatchWinPct: number;
  opponentsGameWinPct: number;
  manualTiebreak: number | null;
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
    // Imported historical pods carry final points only, no match-by-match
    // data — report the override directly rather than deriving from Match
    // rows (which don't exist for them). Tiebreakers have nothing to
    // compute from, so they report as 0, matching what the original
    // standings doc actually showed (points-only rankings).
    if (entrant.finalPointsOverride !== null) {
      return {
        entrantId: entrant.id,
        points: entrant.finalPointsOverride,
        matchWinPct: 0,
        gameWinPct: 0,
        opponentsMatchWinPct: 0,
        opponentsGameWinPct: 0,
        manualTiebreak: entrant.manualTiebreak,
      };
    }

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
      manualTiebreak: entrant.manualTiebreak,
    };
  });

  // manualTiebreak only ever breaks a tie that's already there on points —
  // it can never move an entrant ahead of someone with more points. Placed
  // before the computed tiebreakers on purpose: when an organizer has set
  // it, that's a deliberate human call (e.g. an intentional draw to lock in
  // placement) meant to override what OMW%/GW%/OGW% would otherwise decide,
  // not just a fallback for when those also happen to tie.
  rows.sort(
    (a, b) =>
      b.points - a.points ||
      (a.manualTiebreak !== null || b.manualTiebreak !== null
        ? (a.manualTiebreak ?? Infinity) - (b.manualTiebreak ?? Infinity)
        : 0) ||
      b.opponentsMatchWinPct - a.opponentsMatchWinPct ||
      b.gameWinPct - a.gameWinPct ||
      b.opponentsGameWinPct - a.opponentsGameWinPct,
  );

  return rows;
}
