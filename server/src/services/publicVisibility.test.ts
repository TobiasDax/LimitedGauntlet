import { describe, expect, it } from "vitest";
import { buildRedactor, publicPodFields, publicTournamentFields } from "./publicVisibility.js";

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

// PI-141 — these two are the public read surface's allowlist. The point of
// pinning the exact key set is that the test fails when someone *adds* a
// column, forcing a deliberate decision about publishing it, rather than the
// column going public silently the way it used to.
describe("public row allowlists", () => {
  const TOURNAMENT_KEYS = [
    "id",
    "orgId",
    "name",
    "startDate",
    "endDate",
    "location",
    "description",
    "status",
    "tokenParticipation",
    "tokenStandingBonuses",
    "podsManuallyReordered",
    "createdAt",
  ];

  const POD_KEYS = [
    "id",
    "tournamentId",
    "name",
    "date",
    "startTime",
    "format",
    "setCode",
    "constructedFormat",
    "constructedFormatCustom",
    "sequenceOrder",
    "isTeamEvent",
    "teamSize",
    "roundCount",
    "matchFormat",
    "pointsWin",
    "pointsDraw",
    "pointsLoss",
    "roundLengthMinutes",
    "status",
    "excludeFromStats",
    "rarePicksEnabled",
    "webhookEnabled",
    "isMainEvent",
    "prepTimerEndsAt",
    "prepTimerLabel",
    "tokenParticipation",
    "tokenStandingBonuses",
    "completedAt",
    "canceledAt",
    "isOnDemand",
    "actualStartedAt",
    "capacity",
    "createdAt",
  ];

  const fullTournament = Object.fromEntries(TOURNAMENT_KEYS.map((k) => [k, `v-${k}`]));
  const fullPod = Object.fromEntries(POD_KEYS.map((k) => [k, `v-${k}`]));

  it("publishes exactly the agreed tournament fields", () => {
    const shaped = publicTournamentFields(fullTournament as never);
    expect(Object.keys(shaped).sort()).toEqual([...TOURNAMENT_KEYS].sort());
  });

  it("publishes exactly the agreed pod fields", () => {
    const shaped = publicPodFields(fullPod as never);
    expect(Object.keys(shaped).sort()).toEqual([...POD_KEYS].sort());
  });

  // The regression this exists for: a column added to the schema must not
  // reach a public response just because it exists. PI-140's organizer-only
  // notes field is the concrete case this protects.
  it("drops a column that was never added to the allowlist", () => {
    const tournament = publicTournamentFields({ ...fullTournament, internalNotes: "TO eyes only" } as never);
    const pod = publicPodFields({ ...fullPod, internalNotes: "TO eyes only" } as never);

    expect(tournament).not.toHaveProperty("internalNotes");
    expect(pod).not.toHaveProperty("internalNotes");
    expect(JSON.stringify(tournament)).not.toContain("TO eyes only");
    expect(JSON.stringify(pod)).not.toContain("TO eyes only");
  });
});
