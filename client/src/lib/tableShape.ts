// PI-115 — a TO's proposed/chosen physical-table split for a large
// draft/chaos-draft pod's round 1. Purely a seating-shape concern: never
// touches pairing. Mirrors the server's tableFill.ts MIN_TABLE_SIZE/
// validateTableShape (kept in sync deliberately, same precedent as
// seatings.ts already being duplicated client/server).
export const MIN_TABLE_SIZE = 6;
export const IDEAL_TABLE_SIZE = 8;

// Above this many entrants, offer the "split into tables" choice at all
// (see ROADMAP PI-115) — below it, one big table is always fine.
export const SPLIT_ELIGIBLE_ABOVE = 12;

// A reasonable starting point for the TO to accept or edit — not required to
// be optimal, since table count/sizes are always freely editable before
// generating round 1.
export function suggestTableShape(entrantCount: number): number[] {
  let numTables = Math.max(1, Math.round(entrantCount / IDEAL_TABLE_SIZE));
  while (numTables > 1 && entrantCount / numTables < MIN_TABLE_SIZE) numTables--;

  const base = Math.floor(entrantCount / numTables);
  const remainder = entrantCount % numTables;
  return Array.from({ length: numTables }, (_, i) => base + (i < remainder ? 1 : 0));
}

export type TableShapeError = "no_tables" | "table_too_small" | "size_mismatch";

export function validateTableShape(entrantCount: number, sizes: number[]): TableShapeError | null {
  if (sizes.length === 0) return "no_tables";
  if (sizes.some((s) => s < MIN_TABLE_SIZE)) return "table_too_small";
  if (sizes.reduce((a, b) => a + b, 0) !== entrantCount) return "size_mismatch";
  return null;
}
