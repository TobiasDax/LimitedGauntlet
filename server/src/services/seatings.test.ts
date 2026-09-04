import { describe, expect, it } from "vitest";
import { computeSeatings } from "./seatings.js";

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
      expect(Object.keys(row).sort()).toEqual(["entrantId", "seat"]);
    }
  });
});
