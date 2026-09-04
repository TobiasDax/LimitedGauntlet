import { describe, expect, it } from "vitest";
import { redactUnrevealedRound1 } from "./pairingsVisibility.js";

function round(roundNumber: number, pairingsRevealedAt: Date | null, matches: unknown[] = [{ id: "m1" }]) {
  return { roundNumber, pairingsRevealedAt, matches };
}

describe("redactUnrevealedRound1", () => {
  it("strips round 1's matches when not revealed", () => {
    const [r1] = redactUnrevealedRound1([round(1, null)]);
    expect(r1!.matches).toEqual([]);
  });

  it("keeps round 1's matches once revealed", () => {
    const [r1] = redactUnrevealedRound1([round(1, new Date())]);
    expect(r1!.matches).toEqual([{ id: "m1" }]);
  });

  it("never touches round 2+, revealed or not", () => {
    const [r2] = redactUnrevealedRound1([round(2, null)]);
    expect(r2!.matches).toEqual([{ id: "m1" }]);
  });

  it("leaves every other field untouched", () => {
    const [r1] = redactUnrevealedRound1([round(1, null)]);
    expect(r1).toMatchObject({ roundNumber: 1, pairingsRevealedAt: null });
  });
});
