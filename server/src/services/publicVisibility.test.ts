import { describe, expect, it } from "vitest";
import { buildRedactor, HIDDEN_PLAYER_NAME } from "./publicVisibility.js";

describe("buildRedactor (PI-107)", () => {
  it("reports which ids are hidden", () => {
    const r = buildRedactor(["p1", "p3"]);
    expect(r.isHidden("p1")).toBe(true);
    expect(r.isHidden("p2")).toBe(false);
    expect(r.isHidden(null)).toBe(false);
    expect(r.isHidden(undefined)).toBe(false);
  });

  it("swaps the name for the placeholder only when hidden", () => {
    const r = buildRedactor(new Set(["p1"]));
    expect(r.name("p1", "Alice")).toBe(HIDDEN_PLAYER_NAME);
    expect(r.name("p2", "Bob")).toBe("Bob");
    expect(r.name(null, "fallback")).toBe("fallback");
  });

  it("redacts displayName on a player object without mutating the input", () => {
    const r = buildRedactor(["p1"]);
    const alice = { id: "p1", displayName: "Alice", orgId: "o1" };
    const out = r.player(alice);
    expect(out.displayName).toBe(HIDDEN_PLAYER_NAME);
    expect(out.orgId).toBe("o1");
    expect(alice.displayName).toBe("Alice");
    expect(r.player({ id: "p2", displayName: "Bob" }).displayName).toBe("Bob");
    expect(r.player(null)).toBeNull();
    expect(r.player(undefined)).toBeUndefined();
  });

  it("an empty hidden set is a no-op redactor", () => {
    const r = buildRedactor([]);
    expect(r.name("p1", "Alice")).toBe("Alice");
    expect(r.player({ id: "p1", displayName: "Alice" }).displayName).toBe("Alice");
  });
});
