// PI-80 — round 1's pairings stay hidden from untrusted/public reads until
// the organizer explicitly reveals them (Round.pairingsRevealedAt), even
// though the Round/Match rows already exist (they can be created early,
// purely to produce PI-79's seating chart).
//
// PI-118 — the same condition also gates a pod's public standings: a bye
// entrant's match has no opponent to report a result against, so it's
// auto-scored as a win the moment round 1's Match rows are created — before
// there's anything to reveal. Without this, an unrevealed round 1's
// standings leak exactly who has the bye. Both call sites share this one
// predicate so "hidden" always means the same thing.
export function isRound1Unrevealed(
  round: { roundNumber: number; pairingsRevealedAt: Date | null } | null | undefined,
): boolean {
  return !!round && round.roundNumber === 1 && !round.pairingsRevealedAt;
}

// A pure function so the redaction rule is unit-testable without a real
// request/response.
export function redactUnrevealedRound1<
  T extends { roundNumber: number; pairingsRevealedAt: Date | null; matches: unknown[] },
>(rounds: T[]): T[] {
  return rounds.map((round) => (isRound1Unrevealed(round) ? { ...round, matches: [] } : round));
}
