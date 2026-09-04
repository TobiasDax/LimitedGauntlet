// PI-80 — round 1's pairings stay hidden from untrusted/public reads until
// the organizer explicitly reveals them (Round.pairingsRevealedAt), even
// though the Round/Match rows already exist (they can be created early,
// purely to produce PI-79's seating chart). A pure function so the
// redaction rule is unit-testable without a real request/response.
export function redactUnrevealedRound1<T extends { roundNumber: number; pairingsRevealedAt: Date | null; matches: unknown[] }>(
  rounds: T[],
): T[] {
  return rounds.map((round) =>
    round.roundNumber === 1 && !round.pairingsRevealedAt ? { ...round, matches: [] } : round,
  );
}
