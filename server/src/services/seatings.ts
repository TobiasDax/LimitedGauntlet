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

// PI-115 — seating for a pod split into multiple physical tables. The
// table *assignment* (who's at which table, Entrant.draftTable) never comes
// from pairing — that stays deliberately unconstrained, see pairing.ts. But
// within a table, the classic cross-table convention still applies to
// whichever round-1 pairs actually landed at that table (the common case,
// since tableFill.ts's fillTables tries hard to keep pairs together): seat i
// pairs with seat i+M using computeSeatings' exact same logic, just scoped
// to this table's own entrants and matches instead of the whole pod.
//
// A pair split across two tables (tableFill.ts's rare forced-split edge
// case) has no local partner at either table — each half is treated as a
// local "solo" seat (same shape as computeSeatings' bye handling, seat M),
// even though they do have a real opponent, just elsewhere. Never labeled a
// "Round 1 bye" in the UI (see SeatingChart's showByeBadge), since that
// callout would be wrong for this specific case.
export function computeSplitSeatings(
  round1Matches: SeatableMatch[],
  entrantTable: Map<string, number>,
): SeatAssignment[] {
  const localMatchesByTable = new Map<number, SeatableMatch[]>();
  const pushLocal = (table: number, match: SeatableMatch) => {
    const arr = localMatchesByTable.get(table) ?? [];
    arr.push(match);
    localMatchesByTable.set(table, arr);
  };

  for (const match of round1Matches) {
    const tableA = entrantTable.get(match.entrantAId);
    if (tableA === undefined) continue;

    if (match.entrantBId === null) {
      pushLocal(tableA, match);
      continue;
    }

    const tableB = entrantTable.get(match.entrantBId);
    if (tableB === undefined) continue;

    if (tableA === tableB) {
      pushLocal(tableA, match);
    } else {
      pushLocal(tableA, { tableNumber: match.tableNumber, entrantAId: match.entrantAId, entrantBId: null });
      pushLocal(tableB, { tableNumber: match.tableNumber, entrantAId: match.entrantBId, entrantBId: null });
    }
  }

  const seats: SeatAssignment[] = [];
  for (const [table, matches] of localMatchesByTable) {
    const localEntrantCount = matches.reduce((n, m) => n + (m.entrantBId ? 2 : 1), 0);
    for (const s of computeSeatings(matches, localEntrantCount)) {
      seats.push({ ...s, table });
    }
  }
  return seats;
}
