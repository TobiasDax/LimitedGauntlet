import { describe, expect, it } from "vitest";
import { fillTables, validateTableShape, type FillPair } from "./tableFill.js";

function makePairs(n: number, byeEntrant?: string): FillPair[] {
  const pairs: FillPair[] = [];
  const ids = Array.from({ length: n }, (_, i) => `e${i + 1}`);
  const bye = byeEntrant ? ids.splice(ids.indexOf(byeEntrant), 1)[0] : undefined;
  for (let i = 0; i < ids.length; i += 2) {
    pairs.push({ entrantAId: ids[i]!, entrantBId: ids[i + 1]! });
  }
  if (bye) pairs.push({ entrantAId: bye, entrantBId: null });
  return pairs;
}

function crossTablePairs(pairs: FillPair[], assignment: Map<string, number>): number {
  return pairs.filter((p) => p.entrantBId && assignment.get(p.entrantAId) !== assignment.get(p.entrantBId)).length;
}

describe("validateTableShape", () => {
  it("accepts a shape whose sizes sum to the entrant count and are all >= MIN_TABLE_SIZE", () => {
    expect(validateTableShape(18, [10, 8])).toBeNull();
    expect(validateTableShape(18, [6, 6, 6])).toBeNull();
  });

  it("rejects an empty shape", () => {
    expect(validateTableShape(18, [])).toBe("no_tables");
  });

  it("rejects a table below the minimum size", () => {
    expect(validateTableShape(11, [5, 6])).toBe("table_too_small");
  });

  it("rejects a shape whose sizes don't sum to the entrant count", () => {
    expect(validateTableShape(18, [10, 7])).toBe("size_mismatch");
  });
});

describe("fillTables", () => {
  it("packs an even 18-entrant split (10/8) with zero cross-table pairs", () => {
    const pairs = makePairs(18); // 9 pairs
    const assignment = fillTables(pairs, [10, 8]);
    expect(assignment.size).toBe(18);
    expect(crossTablePairs(pairs, assignment)).toBe(0);
    const counts = [1, 2].map((t) => [...assignment.values()].filter((v) => v === t).length);
    expect(counts).toEqual([10, 8]);
  });

  it("packs an all-even 3-way split (6/6/6) with zero cross-table pairs", () => {
    const pairs = makePairs(18);
    const assignment = fillTables(pairs, [6, 6, 6]);
    expect(crossTablePairs(pairs, assignment)).toBe(0);
    const counts = [1, 2, 3].map((t) => [...assignment.values()].filter((v) => v === t).length);
    expect(counts).toEqual([6, 6, 6]);
  });

  it("seats the bye entrant in an odd table's leftover slot, still zero cross-table pairs", () => {
    // 13 entrants, e13 has the bye. Split 7/6: table 1 has one leftover
    // single seat (7 = 3 pairs + 1), which the bye should fill.
    const pairs = makePairs(13, "e13");
    const assignment = fillTables(pairs, [7, 6]);
    expect(assignment.size).toBe(13);
    expect(assignment.get("e13")).toBe(1);
    expect(crossTablePairs(pairs, assignment)).toBe(0);
    const counts = [1, 2].map((t) => [...assignment.values()].filter((v) => v === t).length);
    expect(counts).toEqual([7, 6]);
  });

  it("splits exactly one pair across two odd tables when there's no bye to absorb the parity", () => {
    // 14 entrants, no bye, split 7/7: each table has one leftover seat, and
    // with no bye entrant, exactly one pair has to cross the table boundary.
    const pairs = makePairs(14);
    const assignment = fillTables(pairs, [7, 7]);
    expect(assignment.size).toBe(14);
    expect(crossTablePairs(pairs, assignment)).toBe(1);
    const counts = [1, 2].map((t) => [...assignment.values()].filter((v) => v === t).length);
    expect(counts).toEqual([7, 7]);
  });
});
