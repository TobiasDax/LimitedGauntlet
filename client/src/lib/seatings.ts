import type { Match } from "./types";

// Pod seating chart (draft, chaos draft, and — since PI-79 — sealed too:
// the physical seat is just as arbitrary for sealed as the raw tableNumber
// order already was for draft, so this needs no format-specific logic),
// derived from round 1's pairings rather than stored separately — so a
// manual edit to round 1 automatically corrects the seatings too. Standard
// MTG draft convention for an N-seat pod: seat i
// pairs with seat i+M in round 1, where M = ceil(N/2) is the table count. A
// bye (odd N) always lands on seat M, since M is the only table whose
// partner slot (M+M = N+1) falls outside the pod.
//
// Table numbers assigned by the pairing engine are arbitrary (whichever
// order it happened to build the pairs in), so this doesn't read them
// directly — it re-numbers round 1's matches 1..M itself (sorted by
// existing tableNumber only for a stable, non-flickering order across
// re-renders), reserving the last slot for a bye if there is one. Which
// entrant of a pair gets the lower vs. higher seat number is arbitrary.
export function computeSeatings(round1Matches: Match[], entrantCount: number): Map<string, number> {
  const seats = new Map<string, number>();
  if (round1Matches.length === 0 || entrantCount === 0) return seats;

  const tableCount = Math.ceil(entrantCount / 2);
  const sorted = [...round1Matches].sort((a, b) => a.tableNumber - b.tableNumber);
  const byeMatch = sorted.find((m) => m.entrantBId === null);
  const realMatches = sorted.filter((m) => m.entrantBId !== null);

  realMatches.forEach((match, index) => {
    const seat = index + 1;
    seats.set(match.entrantAId, seat);
    seats.set(match.entrantBId!, seat + tableCount);
  });
  if (byeMatch) {
    seats.set(byeMatch.entrantAId, tableCount);
  }

  return seats;
}

// PI-115 — seating for a pod split into multiple physical tables. The table
// *assignment* (who's at which table, Entrant.draftTable) never comes from
// pairing — that stays deliberately unconstrained, see the server's
// pairing.ts. But within a table, the classic cross-table convention still
// applies to whichever round-1 pairs actually landed at that table (the
// common case, since the server's tableFill.ts tries hard to keep pairs
// together): seat i pairs with seat i+M using computeSeatings' exact same
// logic above, just scoped to this table's own entrants and matches.
//
// A pair split across two tables (tableFill.ts's rare forced-split edge
// case) has no local partner at either table — each half is treated as a
// local "solo" seat (same shape as computeSeatings' bye handling, seat M),
// even though they do have a real opponent, just elsewhere. Never labeled a
// "Round 1 bye" in the UI (see SeatingChart's showByeBadge), since that
// callout would be wrong for this specific case. Mirrors the server's
// services/seatings.ts computeSplitSeatings (kept in sync deliberately, same
// precedent as computeSeatings above already being duplicated server-side).
export interface SeatAssignment {
  entrantId: string;
  seat: number;
  table: number | null;
}

export function computeSplitSeatings(round1Matches: Match[], entrantTable: Map<string, number>): SeatAssignment[] {
  const localMatchesByTable = new Map<number, Match[]>();
  const pushLocal = (table: number, match: Match) => {
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
      pushLocal(tableA, { ...match, entrantBId: null });
      pushLocal(tableB, { ...match, entrantAId: match.entrantBId, entrantBId: null });
    }
  }

  const seats: SeatAssignment[] = [];
  for (const [table, matches] of localMatchesByTable) {
    const localEntrantCount = matches.reduce((n, m) => n + (m.entrantBId ? 2 : 1), 0);
    for (const [entrantId, seat] of computeSeatings(matches, localEntrantCount)) {
      seats.push({ entrantId, seat, table });
    }
  }
  return seats;
}

// Shared rendering helper for both the organizer Seatings page and the
// public pod page: turns a flat split-seating list into one seatByEntrantId
// map per table, ready to hand to <SeatingChart> — or null when the list
// isn't actually split (every row's table is null), so the caller falls
// back to the single-chart unsplit rendering.
export function groupSeatsByTable(seats: SeatAssignment[]): Map<number, Map<string, number>> | null {
  const split = seats.filter((s) => s.table !== null);
  if (split.length === 0) return null;

  const result = new Map<number, Map<string, number>>();
  for (const s of split) {
    const seatByEntrantId = result.get(s.table!) ?? new Map<string, number>();
    seatByEntrantId.set(s.entrantId, s.seat);
    result.set(s.table!, seatByEntrantId);
  }
  return result;
}
