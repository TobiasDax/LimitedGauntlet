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
  it("groups entrants by table and numbers each table's seats 1..k independently", () => {
    const seats = computeSplitSeatings([
      { id: "a", draftTable: 1 },
      { id: "b", draftTable: 1 },
      { id: "c", draftTable: 2 },
    ]);
    const byId = new Map(seats.map((s) => [s.entrantId, s]));
    expect(byId.get("a")?.table).toBe(1);
    expect(byId.get("b")?.table).toBe(1);
    expect(byId.get("c")?.table).toBe(2);
    expect(byId.get("c")?.seat).toBe(1);
    expect(new Set([byId.get("a")?.seat, byId.get("b")?.seat])).toEqual(new Set([1, 2]));
  });

  it("is empty with no entrants", () => {
    expect(computeSplitSeatings([])).toEqual([]);
  });
});
