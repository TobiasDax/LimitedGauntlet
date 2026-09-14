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
// `table` is null for an unsplit pod's pairing-derived seat (the whole pod
// is one physical table). PI-115's computeSplitSeatings below sets it to the
// 1-indexed physical table number for a pod split across multiple tables —
// see Entrant.draftTable in schema.prisma.
export interface SeatAssignment {
  entrantId: string;
  seat: number;
  table: number | null;
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
    seats.push({ entrantId: match.entrantAId, seat, table: null });
    seats.push({ entrantId: match.entrantBId!, seat: seat + tableCount, table: null });
  });
  if (byeMatch) {
    seats.push({ entrantId: byeMatch.entrantAId, seat: tableCount, table: null });
  }

  return seats;
}

// PI-115 — seating for a pod split into multiple physical tables. Unlike
// computeSeatings above, this is never derived from round 1's pairing (that
// stays deliberately unconstrained, see pairing.ts) — it's purely "who's
// assigned to which table" (Entrant.draftTable, set by tableFill.ts's
// fillTables at round-1-generation time), with a local seat number 1..k
// assigned in a stable (sorted-by-id) order within each table. Which
// specific number a given entrant gets within their table is arbitrary,
// same precedent as computeSeatings above.
export function computeSplitSeatings(entrants: Array<{ id: string; draftTable: number }>): SeatAssignment[] {
  const byTable = new Map<number, string[]>();
  for (const e of entrants) {
    const group = byTable.get(e.draftTable) ?? [];
    group.push(e.id);
    byTable.set(e.draftTable, group);
  }

  const seats: SeatAssignment[] = [];
  for (const [table, ids] of byTable) {
    [...ids].sort().forEach((entrantId, index) => {
      seats.push({ entrantId, seat: index + 1, table });
    });
  }
  return seats;
}
