import { prisma } from "../prisma.js";
import { computePodStats } from "./podStats.js";
import { computePlayerPairHistory } from "./weekendHistory.js";

export class PairingError extends Error {}

export interface PairingSuggestion {
  pairs: Array<{ entrantAId: string; entrantBId: string | null }>;
}

interface EntrantInfo {
  id: string;
  playerIds: string[];
  points: number;
  hasHadBye: boolean;
}

// Weighted so a repeat-elsewhere-this-weekend pairing is only chosen when
// every other option has been exhausted, but a pairing is still always
// found rather than the algorithm giving up — this is a nudge, not a
// second hard rule. Within-pod repeats stay a true hard rule (Infinity),
// handled separately below.
//
// Only applied to round 1: that's the "everyone plays everyone" nudge for
// a pod's opening draw. From round 2 on, standings-based Swiss pairing
// must win outright — otherwise two players tied at the top can get kept
// apart in the pod's final round just because they crossed paths in an
// unrelated pod earlier in the weekend.
const REPEAT_ELSEWHERE_WEIGHT = 1000;

// An entrant is active for a given round unless it dropped before that
// round started. Shared by the pairing algorithm and by manual-pairing
// validation, so both agree on exactly who's supposed to be paired.
export function getActiveEntrants(podId: string, roundNumber: number) {
  return prisma.entrant.findMany({
    where: {
      podId,
      OR: [{ droppedAfterRound: null }, { droppedAfterRound: { gte: roundNumber } }],
    },
    include: { team: { include: { members: true } } },
  });
}

export async function generatePairings(podId: string, roundNumber: number): Promise<PairingSuggestion> {
  const pod = await prisma.pod.findUniqueOrThrow({ where: { id: podId } });

  const entrants = await getActiveEntrants(podId, roundNumber);

  const { points, opponents, hasHadBye } = await computePodStats(podId, roundNumber);
  const weekendHistory =
    roundNumber === 1 ? await computePlayerPairHistory(pod.tournamentId, podId) : new Map<string, number>();

  const infos: EntrantInfo[] = entrants.map((e) => ({
    id: e.id,
    playerIds: e.playerId ? [e.playerId] : (e.team?.members.map((m) => m.playerId) ?? []),
    points: points.get(e.id) ?? 0,
    hasHadBye: hasHadBye.has(e.id),
  }));

  // Round 1: everyone's on 0 points, so a plain sort would just reflect
  // entrant-creation order — shuffle instead for a genuine random draw.
  // Later rounds: sort by points desc, stable on incoming order, so ties
  // within a score group don't reshuffle round to round for no reason.
  let pool = roundNumber === 1 ? shuffle(infos) : [...infos].sort((a, b) => b.points - a.points);

  let byeEntrantId: string | null = null;
  if (pool.length % 2 === 1) {
    let byeIndex = -1;
    for (let i = pool.length - 1; i >= 0; i--) {
      if (!pool[i]!.hasHadBye) {
        byeIndex = i;
        break;
      }
    }
    if (byeIndex === -1) byeIndex = pool.length - 1; // everyone's had one already
    byeEntrantId = pool[byeIndex]!.id;
    pool = [...pool.slice(0, byeIndex), ...pool.slice(byeIndex + 1)];
  }

  const byId = new Map(pool.map((e) => [e.id, e]));

  function pairCost(a: EntrantInfo, b: EntrantInfo): number {
    if (opponents.get(a.id)?.has(b.id)) return Number.POSITIVE_INFINITY;
    let repeatElsewhere = 0;
    for (const pa of a.playerIds) {
      for (const pb of b.playerIds) {
        const key = pa < pb ? `${pa}:${pb}` : `${pb}:${pa}`;
        repeatElsewhere += weekendHistory.get(key) ?? 0;
      }
    }
    const scoreDiff = Math.abs(a.points - b.points);
    return repeatElsewhere * REPEAT_ELSEWHERE_WEIGHT + scoreDiff;
  }

  // Exact minimum-total-cost perfect matching via branch-and-bound, not a
  // greedy "pair the first entrant with their own cheapest partner and
  // never look back." A pure greedy pass can lock in a locally-cheap
  // pairing that blocks a globally better (or fully repeat-free) result
  // for everyone else — e.g. two players who've only faced each other
  // getting paired first, forcing a third pair elsewhere to eat an
  // avoidable repeat that a different first choice would have sidestepped
  // entirely. Costs are never negative, so once a candidate's own edge
  // cost already matches or exceeds the best full-matching cost found so
  // far, no matching built on it (or anything sorted after it) can beat
  // that best — safe to prune the rest of this branch.
  function bestMatching(remaining: string[]): { pairs: Array<[string, string]>; cost: number } | null {
    if (remaining.length === 0) return { pairs: [], cost: 0 };
    const [first, ...rest] = remaining as [string, ...string[]];
    const a = byId.get(first)!;

    const candidates = rest
      .map((id) => ({ id, cost: pairCost(a, byId.get(id)!) }))
      .filter((c) => Number.isFinite(c.cost))
      .sort((x, y) => x.cost - y.cost);

    let best: { pairs: Array<[string, string]>; cost: number } | null = null;
    for (const candidate of candidates) {
      if (best && candidate.cost >= best.cost) break;
      const nextRemaining = rest.filter((id) => id !== candidate.id);
      const solvedRest = bestMatching(nextRemaining);
      if (!solvedRest) continue;
      const totalCost = candidate.cost + solvedRest.cost;
      if (!best || totalCost < best.cost) {
        best = { pairs: [[first, candidate.id], ...solvedRest.pairs], cost: totalCost };
      }
    }
    return best;
  }

  const solved = bestMatching(pool.map((e) => e.id));
  if (!solved) {
    throw new PairingError(
      "No valid pairing avoids all within-pod repeat opponents. Use manual pairing to resolve this round.",
    );
  }

  const pairs: PairingSuggestion["pairs"] = solved.pairs.map(([a, b]) => ({ entrantAId: a, entrantBId: b }));
  if (byeEntrantId) pairs.push({ entrantAId: byeEntrantId, entrantBId: null });

  return { pairs };
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}
