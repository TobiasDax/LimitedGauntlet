import { describe, expect, it } from "vitest";
import { buildRedactor } from "./publicVisibility.js";

const aliases = (entries: [string, string][]) => new Map(entries);

describe("buildRedactor (PI-107/110)", () => {
  it("reports which ids are hidden", () => {
    const r = buildRedactor(
      aliases([
        ["p1", "Player 7F2A"],
        ["p3", "Player Q9KM"],
      ]),
    );
    expect(r.isHidden("p1")).toBe(true);
    expect(r.isHidden("p2")).toBe(false);
    expect(r.isHidden(null)).toBe(false);
    expect(r.isHidden(undefined)).toBe(false);
  });

  it("swaps the name for the player's alias only when hidden", () => {
    const r = buildRedactor(aliases([["p1", "Player 7F2A"]]));
    expect(r.name("p1", "Alice")).toBe("Player 7F2A");
    expect(r.name("p2", "Bob")).toBe("Bob");
    expect(r.name(null, "fallback")).toBe("fallback");
  });

  it("swaps displayName on a player object without mutating the input", () => {
    const r = buildRedactor(aliases([["p1", "Player 7F2A"]]));
    const alice = { id: "p1", displayName: "Alice", orgId: "o1" };
    const out = r.player(alice);
    expect(out.displayName).toBe("Player 7F2A");
    expect(out.orgId).toBe("o1");
    expect(alice.displayName).toBe("Alice");
    expect(r.player({ id: "p2", displayName: "Bob" }).displayName).toBe("Bob");
    expect(r.player(null)).toBeNull();
    expect(r.player(undefined)).toBeUndefined();
  });

  it("an empty map is a no-op redactor", () => {
    const r = buildRedactor(new Map());
    expect(r.name("p1", "Alice")).toBe("Alice");
    expect(r.player({ id: "p1", displayName: "Alice" }).displayName).toBe("Alice");
  });
});
