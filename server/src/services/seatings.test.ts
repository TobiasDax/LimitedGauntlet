import { describe, expect, it } from "vitest";
import { computeSeatings, computeSplitSeatings } from "./seatings.js";

describe("computeSeatings", () => {
  it("cross-pairs seat i with seat i+M for an even pod", () => {
    // 4 entrants, 2 tables: seat 1 <-> seat 3, seat 2 <-> seat 4.
    const seats = computeSeatings(
      [
        { tableNumber: 1, entrantAId: "a", entrantBId: "b" },
        { tableNumber: 2, entrantAId: "c", entrantBId: "d" },
      ],
      4,
    );
    const bySeat = new Map(seats.map((s) => [s.entrantId, s.seat]));
    expect(bySeat.get("a")).toBe(1);
    expect(bySeat.get("b")).toBe(3);
    expect(bySeat.get("c")).toBe(2);
    expect(bySeat.get("d")).toBe(4);
  });

  it("gives the bye entrant the last table's seat", () => {
    // 5 entrants, 3 tables (ceil(5/2)); the bye always lands on seat 3.
    const seats = computeSeatings(
      [
        { tableNumber: 1, entrantAId: "a", entrantBId: "b" },
        { tableNumber: 2, entrantAId: "c", entrantBId: "d" },
        { tableNumber: 3, entrantAId: "e", entrantBId: null },
      ],
      5,
    );
    const bySeat = new Map(seats.map((s) => [s.entrantId, s.seat]));
    expect(bySeat.get("e")).toBe(3);
    expect(seats).toHaveLength(5);
  });

  it("is empty with no round 1 matches or no entrants", () => {
    expect(computeSeatings([], 4)).toEqual([]);
    expect(computeSeatings([{ tableNumber: 1, entrantAId: "a", entrantBId: "b" }], 0)).toEqual([]);
  });

  it("never carries a raw match's paired entrant ids together in one row", () => {
    const seats = computeSeatings([{ tableNumber: 1, entrantAId: "a", entrantBId: "b" }], 2);
    for (const row of seats) {
      expect(Object.keys(row).sort()).toEqual(["entrantId", "seat", "table"]);
    }
  });
});

describe("computeSplitSeatings", () => {
  // Regression case: an 8-seat table (crazy town, PI-115 real-world bug
  // report) whose four round-1 pairs are entirely same-table. The seat
  // numbering must come from those actual pairs, not an arbitrary sort —
  // seat i has to cross-pair with seat i+4 to match who's really playing whom.
  it("derives an 8-seat table's local seat-across-the-table convention from its own round-1 pairs", () => {
    const matches = [
      { tableNumber: 1, entrantAId: "p4", entrantBId: "p16" },
      { tableNumber: 2, entrantAId: "p8", entrantBId: "p20" },
      { tableNumber: 3, entrantAId: "p7", entrantBId: "p13" },
      { tableNumber: 4, entrantAId: "p1", entrantBId: "p19" },
    ];
    const entrantTable = new Map(["p1", "p4", "p7", "p8", "p13", "p16", "p19", "p20"].map((id) => [id, 1]));

    const seats = computeSplitSeatings(matches, entrantTable);
    const seatOf = new Map(seats.map((s) => [s.entrantId, s.seat]));

    expect(seats).toHaveLength(8);
    for (const s of seats) expect(s.table).toBe(1);
    // Every real pair's two seats must be exactly 4 (= 8/2) apart.
    const realPairs: Array<[string, string]> = [
      ["p4", "p16"],
      ["p8", "p20"],
      ["p7", "p13"],
      ["p1", "p19"],
    ];
    for (const [a, b] of realPairs) {
      expect(Math.abs(seatOf.get(a)! - seatOf.get(b)!)).toBe(4);
    }
  });

  it("groups matches by table and numbers each table's seats independently", () => {
    const matches = [
      { tableNumber: 1, entrantAId: "a", entrantBId: "b" },
      { tableNumber: 2, entrantAId: "c", entrantBId: "d" },
    ];
    const entrantTable = new Map([
      ["a", 1],
      ["b", 1],
      ["c", 2],
      ["d", 2],
    ]);
    const seats = computeSplitSeatings(matches, entrantTable);
    const byId = new Map(seats.map((s) => [s.entrantId, s]));
    expect(byId.get("a")?.table).toBe(1);
    expect(byId.get("c")?.table).toBe(2);
    expect(byId.get("c")?.seat).toBe(1);
  });

  it("treats a pair split across two tables as a local solo seat on each side", () => {
    // tableFill.ts's rare forced-split edge case: e and f are real round-1
    // opponents but landed at different physical tables.
    const matches = [
      { tableNumber: 1, entrantAId: "a", entrantBId: "b" },
      { tableNumber: 2, entrantAId: "e", entrantBId: "f" },
    ];
    const entrantTable = new Map([
      ["a", 1],
      ["b", 1],
      ["e", 1],
      ["f", 2],
    ]);
    const seats = computeSplitSeatings(matches, entrantTable);
    const byId = new Map(seats.map((s) => [s.entrantId, s]));
    expect(byId.get("e")?.table).toBe(1);
    expect(byId.get("f")?.table).toBe(2);
    // Table 1 has 3 real seats (a, b, e); table 2 has 1 (f).
    expect([...byId.values()].filter((s) => s.table === 1)).toHaveLength(3);
    expect([...byId.values()].filter((s) => s.table === 2)).toHaveLength(1);
  });

  it("is empty with no matches", () => {
    expect(computeSplitSeatings([], new Map())).toEqual([]);
  });
});
