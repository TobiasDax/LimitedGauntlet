// Server-side port of client/src/lib/seatings.ts's computeSeatings — kept in
// sync deliberately (client and server are separate packages with no shared
// code here) so the public seating endpoint (PI-79/80) can compute the same
// chart without ever serializing a raw Match row (entrantAId/entrantBId
// together is exactly the "opponent pairing" that route must not carry).
//
// Standard MTG draft convention for an N-seat pod: seat i pairs with seat
// i+M in round 1, where M = ceil(N/2) is the table count. A bye (odd N)
// always lands on seat M, the only table whose partner slot (M+M = N+1)
// falls outside the pod. Table numbers are re-numbered 1..M by sorted
// tableNumber for a stable order — which entrant of a pair gets the lower
// vs. higher seat number is arbitrary.
export interface SeatAssignment {
  entrantId: string;
  seat: number;
}

interface SeatableMatch {
  tableNumber: number;
  entrantAId: string;
  entrantBId: string | null;
}

export function computeSeatings(round1Matches: SeatableMatch[], entrantCount: number): SeatAssignment[] {
  if (round1Matches.length === 0 || entrantCount === 0) return [];

  const tableCount = Math.ceil(entrantCount / 2);
  const sorted = [...round1Matches].sort((a, b) => a.tableNumber - b.tableNumber);
  const byeMatch = sorted.find((m) => m.entrantBId === null);
  const realMatches = sorted.filter((m) => m.entrantBId !== null);

  const seats: SeatAssignment[] = [];
  realMatches.forEach((match, index) => {
    const seat = index + 1;
    seats.push({ entrantId: match.entrantAId, seat });
    seats.push({ entrantId: match.entrantBId!, seat: seat + tableCount });
  });
  if (byeMatch) {
    seats.push({ entrantId: byeMatch.entrantAId, seat: tableCount });
  }

  return seats;
}
