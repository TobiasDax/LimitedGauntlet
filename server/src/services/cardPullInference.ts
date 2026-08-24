import { prisma } from "../prisma.js";
import { computePodStandings } from "./standings.js";

// A player who finishes top-3 in a pod is, in practice, very likely to
// have picked one of that pod's most valuable cards — strong decks lean
// on strong cards. Above a meaningful price floor, that's a good enough
// heuristic to suggest an attribution automatically, as long as it's
// clearly marked as a guess (CardPull.playerIdInferred) until a human
// confirms or reassigns it. Team pods are skipped entirely — a single
// pulled card can't be credited to "a team," only to one player, and
// guessing which member would be worse than not guessing at all.
const MIN_INFERRED_PRICE = 10;
const MAX_INFERRED_RANKS = 3;

// Only infers once a pod is actually decided. That means either every
// round played and completed, OR — the imported-history case, where most
// pre-app pods have final points but no round-by-round Match data at all
// (deliberately, per the import script's design: no fabricating pairings
// that were never recorded) — every entrant carries a
// finalPointsOverride. Missing this second case entirely skips inference
// for standings-only pods regardless of how many times it's re-run,
// since "zero rounds" looks identical to "not decided yet." Never
// touches a pull a human has already set/confirmed (playerIdInferred:
// false, whether they picked it explicitly or confirmed a prior guess)
// — inference only ever fills in or refreshes its own unconfirmed
// guesses.
export async function inferCardPullAttribution(podId: string): Promise<void> {
  const pod = await prisma.pod.findUnique({
    where: { id: podId },
    include: { rounds: true, entrants: true },
  });
  if (!pod || pod.isTeamEvent || pod.entrants.length === 0) return;

  const roundsDecided =
    pod.rounds.length > 0 &&
    pod.rounds.length >= pod.roundCount &&
    pod.rounds.every((r) => r.status === "COMPLETED");
  const standingsOnlyDecided = pod.entrants.every((e) => e.finalPointsOverride !== null);
  if (!roundsDecided && !standingsOnlyDecided) return;

  const [standings, entrants, pulls] = await Promise.all([
    computePodStandings(podId),
    prisma.entrant.findMany({ where: { podId } }),
    prisma.cardPull.findMany({ where: { podId }, orderBy: { priceEur: "desc" } }),
  ]);

  const playerIdByEntrant = new Map(entrants.map((e) => [e.id, e.playerId]));
  const ranks = standings.slice(0, MAX_INFERRED_RANKS);

  for (let i = 0; i < ranks.length; i++) {
    const playerId = playerIdByEntrant.get(ranks[i]!.entrantId);
    const pull = pulls[i];
    if (!playerId || !pull) continue;
    if (pull.priceEur === null || Number(pull.priceEur) <= MIN_INFERRED_PRICE) continue;
    if (pull.playerId !== null && !pull.playerIdInferred) continue; // human-set/confirmed, never touch
    if (pull.playerId === playerId && pull.playerIdInferred) continue; // already correct, no-op

    await prisma.cardPull.update({ where: { id: pull.id }, data: { playerId, playerIdInferred: true } });
  }
}
