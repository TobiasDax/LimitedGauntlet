import { describe, expect, it } from "vitest";
import { IMPORT_LIMITS, parseOrgExport } from "./orgImport.js";

const envelope = (data: unknown) => ({
  application: "limited-gauntlet",
  formatVersion: 1,
  exportedAt: "2026-08-26T00:00:00.000Z",
  organization: { slug: "test-org", name: "Test Org" },
  data,
});

describe("parseOrgExport import budgets", () => {
  it("accepts a small valid export", () => {
    expect(parseOrgExport({
      ...envelope({ players: ["Alice"], tournaments: [] }),
      hallOfFame: [],
      treasureVault: [],
    })).toMatchObject({ ok: true });
  });

  it("rejects malformed dates before any database work", () => {
    const data = {
      players: [],
      tournaments: [{
        name: "Bad date",
        startDate: "not-a-date",
        endDate: "2026-01-02T00:00:00.000Z",
        location: null,
        description: null,
        status: "PLANNING",
        players: [],
        pods: [],
      }],
    };
    expect(parseOrgExport(envelope(data))).toEqual({ ok: false, error: "invalid_shape" });
  });

  it("rejects a top-level collection above its limit", () => {
    const players = Array.from({ length: IMPORT_LIMITS.players + 1 }, (_, index) => `P${index}`);
    expect(parseOrgExport(envelope({ players, tournaments: [] }))).toEqual({ ok: false, error: "invalid_shape" });
  });

  it("rejects ignored object fields instead of letting them bypass budgets", () => {
    expect(parseOrgExport(envelope({ players: [], tournaments: [], padding: "x" }))).toEqual({
      ok: false,
      error: "invalid_shape",
    });
  });

  it("rejects an aggregate string budget above the semantic limit", () => {
    const players = Array.from(
      { length: IMPORT_LIMITS.players },
      (_, index) => `${index.toString().padStart(4, "0")}${"x".repeat(96)}`,
    );
    const tournaments = Array.from({ length: IMPORT_LIMITS.tournaments }, (_, index) => ({
      name: `Tournament ${index}`,
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-01-02T00:00:00.000Z",
      location: "x".repeat(200),
      description: "x".repeat(10_000),
      status: "PLANNING",
      players,
      pods: [],
    }));

    expect(parseOrgExport(envelope({ players, tournaments }))).toEqual({ ok: false, error: "import_too_large" });
  });
});
