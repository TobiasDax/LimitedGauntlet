import { prisma } from "../prisma.js";

export interface PodStats {
  points: Map<string, number>;
  opponents: Map<string, Set<string>>;
  hasHadBye: Set<string>;
  matchesPlayed: Map<string, number>;
  gamesWon: Map<string, number>;
  gamesPlayed: Map<string, number>;
}

interface MatchLike {
  entrantAId: string;
  entrantBId: string | null;
  result: "PENDING" | "A_WINS" | "B_WINS" | "DRAW";
  gamesWonA: number;
  gamesWonB: number;
  gamesDrawn: number;
}

interface PodPointConfig {
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
}

// The one place match results get turned into points/opponents/games —
// used both by pairing (which only ever sees matches from rounds already
// guaranteed COMPLETED, so the PENDING skip below never actually triggers
// there) and by standings (which may be asked mid-round, where it matters).
function tallyMatches(matches: MatchLike[], pod: PodPointConfig): PodStats {
  const points = new Map<string, number>();
  const opponents = new Map<string, Set<string>>();
  const hasHadBye = new Set<string>();
  const matchesPlayed = new Map<string, number>();
  const gamesWon = new Map<string, number>();
  const gamesPlayed = new Map<string, number>();

  const addPoints = (id: string, amount: number) => points.set(id, (points.get(id) ?? 0) + amount);
  const addMatchPlayed = (id: string) => matchesPlayed.set(id, (matchesPlayed.get(id) ?? 0) + 1);
  const addGames = (id: string, won: number, played: number) => {
    gamesWon.set(id, (gamesWon.get(id) ?? 0) + won);
    gamesPlayed.set(id, (gamesPlayed.get(id) ?? 0) + played);
  };
  const opponentSet = (id: string) => {
    if (!opponents.has(id)) opponents.set(id, new Set());
    return opponents.get(id)!;
  };

  for (const match of matches) {
    if (match.entrantBId === null) {
      // Bye: a full win, and by MTR convention counts as a clean 2-0 for
      // game-win% purposes even though no games were actually played.
      addPoints(match.entrantAId, pod.pointsWin);
      addMatchPlayed(match.entrantAId);
      addGames(match.entrantAId, 2, 2);
      hasHadBye.add(match.entrantAId);
      continue;
    }

    if (match.result === "PENDING") continue; // not decided yet, doesn't count toward anything

    opponentSet(match.entrantAId).add(match.entrantBId);
    opponentSet(match.entrantBId).add(match.entrantAId);
    addMatchPlayed(match.entrantAId);
    addMatchPlayed(match.entrantBId);
    // Drawn games count as played for both sides (diluting game-win%) but are
    // credited to neither — the MTR convention larger tournaments use.
    const gamesPlayed = match.gamesWonA + match.gamesWonB + match.gamesDrawn;
    addGames(match.entrantAId, match.gamesWonA, gamesPlayed);
    addGames(match.entrantBId, match.gamesWonB, gamesPlayed);

    if (match.result === "A_WINS") {
      addPoints(match.entrantAId, pod.pointsWin);
      addPoints(match.entrantBId, pod.pointsLoss);
    } else if (match.result === "B_WINS") {
      addPoints(match.entrantBId, pod.pointsWin);
      addPoints(match.entrantAId, pod.pointsLoss);
    } else if (match.result === "DRAW") {
      addPoints(match.entrantAId, pod.pointsDraw);
      addPoints(match.entrantBId, pod.pointsDraw);
    }
  }

  return { points, opponents, hasHadBye, matchesPlayed, gamesWon, gamesPlayed };
}

// Computed from rounds strictly before `beforeRoundNumber` — the state
// pairing should see when working on round N is beforeRoundNumber = N, so
// only rounds 1..N-1 count.
export async function computePodStats(podId: string, beforeRoundNumber: number): Promise<PodStats> {
  const pod = await prisma.pod.findUniqueOrThrow({ where: { id: podId } });
  const rounds = await prisma.round.findMany({
    where: { podId, roundNumber: { lt: beforeRoundNumber } },
    include: { matches: true },
  });
  return tallyMatches(rounds.flatMap((r) => r.matches), pod);
}

// Every round of the pod, as of right now — used for standings, which may
// be viewed mid-tournament while a round is still in progress.
export async function computeAllPodStats(podId: string): Promise<PodStats> {
  const pod = await prisma.pod.findUniqueOrThrow({ where: { id: podId } });
  const rounds = await prisma.round.findMany({ where: { podId }, include: { matches: true } });
  return tallyMatches(rounds.flatMap((r) => r.matches), pod);
}
