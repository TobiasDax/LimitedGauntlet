// PI-115 — splitting a large draft/chaos-draft pod's round 1 across multiple
// physical tables. Purely a physical-seating concern: never reads or writes
// anything pairing/standings care about (see pairing.ts, which stays
// completely unaware this exists). Two pieces:
//
//  - validateTableShape: sanity-checks a TO-chosen table shape (count +
//    sizes) against the pod's entrant count, before round 1 is generated.
//  - fillTables: once round 1's pairing exists, assigns each entrant to one
//    of the shape's tables so that round-1 pairs land at the same table
//    wherever possible.
//
// The fill is a bin-packing of round 1's pairs (already generated,
// unconstrained — this never feeds back into pairing.ts): each pair is an
// atomic 2-seat block, so packing whole pairs into each table's capacity
// achieves zero cross-table pairs whenever every table size is even. A
// cross-table pair only becomes unavoidable when size parity doesn't divide
// evenly among the pair-blocks (e.g. two odd-sized tables with no bye to
// soak the remainder) — see the "leftover seats" step below.
export const MIN_TABLE_SIZE = 6;

export type TableShapeError = "no_tables" | "table_too_small" | "size_mismatch";

export function validateTableShape(entrantCount: number, sizes: number[]): TableShapeError | null {
  if (sizes.length === 0) return "no_tables";
  if (sizes.some((s) => s < MIN_TABLE_SIZE)) return "table_too_small";
  if (sizes.reduce((a, b) => a + b, 0) !== entrantCount) return "size_mismatch";
  return null;
}

export interface FillPair {
  entrantAId: string;
  entrantBId: string | null;
}

// Returns entrantId -> 1-indexed table number. Caller (rounds.ts) is
// expected to have already validated the shape via validateTableShape.
export function fillTables(pairs: FillPair[], tableSizes: number[]): Map<string, number> {
  const assignment = new Map<string, number>();

  const byePair = pairs.find((p) => p.entrantBId === null) ?? null;
  const realPairs = pairs.filter((p) => p.entrantBId !== null);

  // Each table needs floor(size/2) whole pairs, plus size%2 leftover single
  // seats it can't fill with a whole pair.
  const tableCapPairs = tableSizes.map((s) => Math.floor(s / 2));
  const leftoverTables: number[] = [];
  tableSizes.forEach((s, i) => {
    if (s % 2 === 1) leftoverTables.push(i);
  });

  // Assign whole pairs to tables in order, filling each table's pair
  // capacity before moving to the next — both members of a pair always land
  // at the same table.
  let pairIdx = 0;
  for (let t = 0; t < tableSizes.length; t++) {
    for (let c = 0; c < tableCapPairs[t]!; c++) {
      const pair = realPairs[pairIdx++];
      if (!pair) continue; // shouldn't happen given a validated shape
      assignment.set(pair.entrantAId, t + 1);
      assignment.set(pair.entrantBId!, t + 1);
    }
  }

  // Fill leftover single seats. The bye entrant (if any) takes one first —
  // they're not playing this round anyway, so they're the natural fit for a
  // seat with no guaranteed same-table opponent.
  const leftoverQueue = [...leftoverTables];
  if (byePair) {
    const t = leftoverQueue.shift();
    if (t !== undefined) assignment.set(byePair.entrantAId, t + 1);
  }

  // Any remaining leftover seats come in pairs (proof: total leftover seats
  // minus the bye's one seat is always even — each table's size splits into
  // an even 2*cap plus its 0-or-1 leftover, and the total entrant count is
  // realPairs.length*2 + (byePair ? 1 : 0), so the two leftover counts must
  // match up mod 2). Fill two at a time by splitting one remaining pair
  // across them — the only case a round-1 pair crosses tables.
  while (leftoverQueue.length >= 2) {
    const tA = leftoverQueue.shift()!;
    const tB = leftoverQueue.shift()!;
    const pair = realPairs[pairIdx++];
    if (!pair) break; // shouldn't happen given a validated shape
    assignment.set(pair.entrantAId, tA + 1);
    assignment.set(pair.entrantBId!, tB + 1);
  }

  return assignment;
}
