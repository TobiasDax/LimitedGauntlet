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

// PI-89 — guards on the exact minimum-cost matching search (see solveExact
// below). Real events are ≤16 entrants; above EXACT_MATCHING_POOL_LIMIT the
// exact solve is skipped outright, and within it the recursion is capped at
// MATCHING_CALL_BUDGET calls (~tens of ms even in the adversarial case) —
// either way the fallback is solveGreedy. The budget was picked from a
// timing sweep: a repeat-dense 16-entrant round 1 can otherwise pin the
// event loop for the better part of a second.
const EXACT_MATCHING_POOL_LIMIT = 18;
const MATCHING_CALL_BUDGET = 300_000;

class MatchingBudgetExceeded extends Error {}

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

// The pod's most recently created round, if any — used to decide whether
// pairing/roster changes are allowed right now (only between rounds, never
// while one is ACTIVE/PENDING).
export function getLatestRound(podId: string) {
  return prisma.round.findFirst({ where: { podId }, orderBy: { roundNumber: "desc" } });
}

// Which of these proposed pairings put two entrants together who have already
// met earlier in this pod. The auto-pairing engine treats a within-pod repeat
// as a hard rule, but an organizer pairing by hand (or swapping two seats) can
// still create one — deliberately or by accident. Those paths are not blocked:
// an organizer overriding the engine is a legitimate act, and the round may
// genuinely have no repeat-free arrangement left. They are warned instead, so
// an accidental repeat doesn't reach the table unnoticed the way the greedy
// fallback's used to.
export async function findRepeatPairings(
  podId: string,
  roundNumber: number,
  pairs: ReadonlyArray<{ entrantAId: string; entrantBId: string | null }>,
): Promise<Array<{ entrantAId: string; entrantBId: string }>> {
  const { opponents } = await computePodStats(podId, roundNumber);
  const repeats: Array<{ entrantAId: string; entrantBId: string }> = [];
  for (const pair of pairs) {
    if (!pair.entrantBId) continue;
    if (opponents.get(pair.entrantAId)?.has(pair.entrantBId)) {
      repeats.push({ entrantAId: pair.entrantAId, entrantBId: pair.entrantBId });
    }
  }
  return repeats;
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
  const pool = roundNumber === 1 ? shuffle(infos) : [...infos].sort((a, b) => b.points - a.points);

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

  type Matching = { pairs: Array<[string, string]>; cost: number };

  // Exact minimum-total-cost perfect matching of one (even-sized) set of
  // entrants. Returns null when no matching avoids every within-pod repeat.
  //
  // `bestMatching` is branch-and-bound, not a greedy "pair the first entrant
  // with their own cheapest partner and never look back": a pure greedy pass
  // can lock in a locally-cheap pairing that blocks a globally better (or
  // fully repeat-free) result for everyone else — e.g. two players who've
  // only faced each other getting paired first, forcing a third pair to eat
  // an avoidable repeat a different first choice would have sidestepped.
  // Costs are never negative, so once a candidate's own edge cost already
  // matches or exceeds the best full-matching cost found so far, no matching
  // built on it (or anything sorted after it) can beat that best — safe to
  // prune the rest of the branch.
  //
  // The prune keeps this fast at real pod sizes (PLAN.md's ceiling is ≤16),
  // but the worst case is exponential: a large pod where the cost function
  // produces many near-equal options (dense repeat-elsewhere history in
  // round 1, everyone bunched on similar points) defeats the prune. A call
  // budget bounds the work — when it's exceeded, `solveExact` bails and the
  // caller falls back to `solveGreedy`. See ROADMAP PI-89.
  function solveExact(poolInfos: EntrantInfo[]): Matching | null | "budget" {
    const byId = new Map(poolInfos.map((e) => [e.id, e]));
    let calls = 0;

    function bestMatching(remaining: string[]): Matching | null {
      if (++calls > MATCHING_CALL_BUDGET) throw new MatchingBudgetExceeded();
      if (remaining.length === 0) return { pairs: [], cost: 0 };
      const [first, ...rest] = remaining as [string, ...string[]];
      const a = byId.get(first)!;

      const candidates = rest
        .map((id) => ({ id, cost: pairCost(a, byId.get(id)!) }))
        .filter((c) => Number.isFinite(c.cost))
        .sort((x, y) => x.cost - y.cost);

      let best: Matching | null = null;
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

    try {
      return bestMatching(poolInfos.map((e) => e.id));
    } catch (err) {
      if (err instanceof MatchingBudgetExceeded) return "budget";
      throw err;
    }
  }

  // Greedy score-group fallback for pods too large (or too adversarial) for
  // the exact solve: walk the pool in order (points desc, or the round-1
  // shuffle), pairing each still-unpaired entrant with the nearest later
  // entrant they haven't already faced in this pod. Honours the within-pod
  // hard-avoid, but drops the global-optimum guarantee and the round-1
  // soft-avoid weighting — standard Swiss behaviour.
  //
  // Greedy never backtracks, so it can paint itself into a corner: by the
  // final pair there is exactly one candidate left, and if those two have
  // already met, the repeat is forced no matter how many legal partners
  // existed earlier. That is not a genuinely unpairable round — it is
  // greedy's own earlier choices. (Observed in production: a 42-entrant pod
  // where round 6's last two had met in round 3, while every player still
  // had 26+ legal partners available.)
  //
  // So a forced repeat is repaired rather than accepted: find any other pair
  // whose partners can be exchanged to make both pairs legal. On a pool with
  // this much remaining history that virtually always succeeds, and it is
  // O(pairs) per repair. If it genuinely cannot be repaired, return null —
  // the caller then raises PairingError exactly as the exact solver's null
  // does, so the organizer is told to pair manually instead of being handed
  // a silent repeat.
  function solveGreedy(poolInfos: EntrantInfo[]): Matching | null {
    const byId = new Map(poolInfos.map((e) => [e.id, e]));
    const remaining = poolInfos.map((e) => e.id);
    const pairs: Array<[string, string]> = [];
    while (remaining.length > 0) {
      const first = remaining.shift()!;
      const a = byId.get(first)!;
      let idx = remaining.findIndex((id) => Number.isFinite(pairCost(a, byId.get(id)!)));
      // No legal partner left below this entrant — take the next one and let
      // the repair pass below sort it out.
      if (idx === -1) idx = 0;
      const [partner] = remaining.splice(idx, 1);
      pairs.push([first, partner!]);
    }

    const legal = (x: string, y: string) => Number.isFinite(pairCost(byId.get(x)!, byId.get(y)!));

    for (let i = 0; i < pairs.length; i++) {
      const [a, b] = pairs[i]!;
      if (legal(a, b)) continue;

      let repaired = false;
      for (let j = 0; j < pairs.length && !repaired; j++) {
        if (i === j) continue;
        const [x, y] = pairs[j]!;
        // Both recombinations are checked in full before either is applied,
        // so a repair can never trade one repeat for another.
        if (legal(a, x) && legal(b, y)) {
          pairs[i] = [a, x];
          pairs[j] = [b, y];
          repaired = true;
        } else if (legal(a, y) && legal(b, x)) {
          pairs[i] = [a, y];
          pairs[j] = [b, x];
          repaired = true;
        }
      }
      if (!repaired) return null;
    }

    let cost = 0;
    for (const [a, b] of pairs) cost += pairCost(byId.get(a)!, byId.get(b)!);
    return { pairs, cost };
  }

  // Above this, skip the exact solver entirely — real events are ≤16
  // entrants; a 20+ pod isn't worth an exponential search even before the
  // cost landscape turns adversarial.
  const exactOK = pool.length <= EXACT_MATCHING_POOL_LIMIT;
  let usedGreedy = !exactOK;

  // `solve` runs the chosen strategy on one sub-pool. `solveExact` can report
  // "budget" mid-run; that unwinds via `MatchingBudgetExceeded` from inside
  // the bye loop so the whole pairing restarts greedy (below), rather than
  // silently mixing an exact bye choice with a greedy remainder.
  function solve(subPool: EntrantInfo[]): Matching | null {
    if (usedGreedy) return solveGreedy(subPool);
    const result = solveExact(subPool);
    if (result === "budget") throw new MatchingBudgetExceeded();
    return result;
  }

  // Bye + matching are chosen together: the natural lowest-score bye can
  // strand a forced repeat pair among the rest (e.g. three entrants left
  // after a drop, where the two non-bye players already met), so try each
  // bye candidate in preference order until the remaining pool is actually
  // matchable. Preference: entrants with no prior bye first (lowest score
  // first), then everyone (lowest score first) for the "already had one"
  // fallback.
  function runMatching(): { solved: Matching | null; byeEntrantId: string | null } {
    if (pool.length % 2 === 0) {
      return { solved: solve(pool), byeEntrantId: null };
    }
    const tried = new Set<number>();
    const byeOrder: number[] = [];
    for (let i = pool.length - 1; i >= 0; i--) if (!pool[i]!.hasHadBye) byeOrder.push(i);
    for (let i = pool.length - 1; i >= 0; i--) if (!byeOrder.includes(i)) byeOrder.push(i);

    for (const byeIndex of byeOrder) {
      if (tried.has(byeIndex)) continue;
      tried.add(byeIndex);
      const attempt = solve([...pool.slice(0, byeIndex), ...pool.slice(byeIndex + 1)]);
      if (attempt) return { solved: attempt, byeEntrantId: pool[byeIndex]!.id };
    }
    return { solved: null, byeEntrantId: null };
  }

  let byeEntrantId: string | null;
  let solved: Matching | null;
  try {
    ({ solved, byeEntrantId } = runMatching());
  } catch (err) {
    if (!(err instanceof MatchingBudgetExceeded)) throw err;
    usedGreedy = true;
    ({ solved, byeEntrantId } = runMatching());
  }

  if (usedGreedy) {
    console.warn(
      `[pairing] pod ${podId} round ${roundNumber}: ${pool.length} active entrants — used greedy ` +
        `score-group pairing, not the exact minimum-cost matching (pod too large or cost landscape too flat).`,
    );
  }

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
