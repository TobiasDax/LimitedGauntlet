import { prisma } from "../prisma.js";

export interface PodStats {
  points: Map<string, number>;
  opponents: Map<string, Set<string>>;
  hasHadBye: Set<string>;
}

// Computed from rounds strictly before `beforeRoundNumber` — the state
// pairing (and eventually standings) should see when working on round N is
// beforeRoundNumber = N, so only rounds 1..N-1 count.
export async function computePodStats(podId: string, beforeRoundNumber: number): Promise<PodStats> {
  const pod = await prisma.pod.findUniqueOrThrow({ where: { id: podId } });
  const rounds = await prisma.round.findMany({
    where: { podId, roundNumber: { lt: beforeRoundNumber } },
    include: { matches: true },
  });

  const points = new Map<string, number>();
  const opponents = new Map<string, Set<string>>();
  const hasHadBye = new Set<string>();

  const addPoints = (id: string, amount: number) => points.set(id, (points.get(id) ?? 0) + amount);
  const opponentSet = (id: string) => {
    if (!opponents.has(id)) opponents.set(id, new Set());
    return opponents.get(id)!;
  };

  for (const round of rounds) {
    for (const match of round.matches) {
      if (match.entrantBId === null) {
        addPoints(match.entrantAId, pod.pointsWin);
        hasHadBye.add(match.entrantAId);
        continue;
      }

      opponentSet(match.entrantAId).add(match.entrantBId);
      opponentSet(match.entrantBId).add(match.entrantAId);

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
  }

  return { points, opponents, hasHadBye };
}
