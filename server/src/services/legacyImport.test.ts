import { afterAll, describe, expect, it } from "vitest";
import { makePrismaClient } from "../db.js";
import { importLegacyData, parseLegacyImport, type LegacyData } from "./legacyImport.js";
import { IMPORT_LIMITS } from "./orgImport.js";

const prisma = makePrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeOrg() {
  const u = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return prisma.organization.create({ data: { slug: `legacy-${u}`, name: "Legacy Test Org" } });
}

const minimalTournament = (overrides: Partial<LegacyData["tournaments"][number]> = {}) => ({
  name: "GP Weekend",
  startDate: "2026-01-01",
  endDate: "2026-01-02",
  location: "Someone's basement",
  status: "COMPLETED" as const,
  players: ["Alice", "Bob"],
  pods: [],
  ...overrides,
});

describe("parseLegacyImport", () => {
  it("accepts a minimal valid file", () => {
    expect(parseLegacyImport({ players: [], tournaments: [] })).toEqual({
      ok: true,
      data: { players: [], tournaments: [] },
    });
  });

  it("rejects an unrelated JSON shape as not_our_format", () => {
    expect(parseLegacyImport({ hello: "world" })).toEqual({ ok: false, error: "not_our_format" });
    expect(parseLegacyImport("not even an object")).toEqual({ ok: false, error: "not_our_format" });
  });

  it("rejects a PI-38 export envelope as not_our_format (mutually exclusive shapes)", () => {
    expect(
      parseLegacyImport({
        application: "limited-gauntlet",
        formatVersion: 1,
        exportedAt: "2026-01-01T00:00:00.000Z",
        organization: { slug: "x", name: "X" },
      }),
    ).toEqual({ ok: false, error: "not_our_format" });
  });

  it("rejects a legacy-shaped file with a bad enum value as invalid_shape", () => {
    const data = { players: [], tournaments: [minimalTournament({ status: "NOT_A_STATUS" as never })] };
    expect(parseLegacyImport(data)).toEqual({ ok: false, error: "invalid_shape" });
  });

  it("rejects a malformed date before any database work", () => {
    const data = { players: [], tournaments: [minimalTournament({ startDate: "not-a-date" })] };
    expect(parseLegacyImport(data)).toEqual({ ok: false, error: "invalid_shape" });
  });

  it("rejects an over-limit top-level collection", () => {
    const players = Array.from({ length: IMPORT_LIMITS.players + 1 }, (_, i) => `P${i}`);
    expect(parseLegacyImport({ players, tournaments: [] })).toEqual({ ok: false, error: "invalid_shape" });
  });
});

describe("importLegacyData", () => {
  it("imports a round-by-round individual pod, deriving points/results from real matches", async () => {
    const org = await makeOrg();
    const data: LegacyData = {
      players: ["Alice", "Bob", "Cara"],
      tournaments: [
        minimalTournament({
          players: ["Alice", "Bob", "Cara"],
          pods: [
            {
              name: "Freitag",
              format: "DRAFT",
              rounds: [
                [
                  { a: "Alice", b: "Bob", result: "A_WINS", gamesA: 2, gamesB: 0 },
                  { a: "Cara", b: null, result: "A_WINS" }, // bye
                ],
              ],
            },
          ],
        }),
      ],
    };

    const summary = await importLegacyData(org.id, data);
    expect(summary).toEqual({ tournamentsCreated: 1, tournamentsSkipped: 0, podsCreated: 1, playersCreated: 3 });

    const tournament = await prisma.tournament.findFirstOrThrow({ where: { orgId: org.id, name: "GP Weekend" } });
    expect(tournament.location).toBe("Someone's basement");
    expect(tournament.status).toBe("COMPLETED");

    const pod = await prisma.pod.findFirstOrThrow({ where: { tournamentId: tournament.id, name: "Freitag" } });
    expect(pod.status).toBe("COMPLETED");
    expect(pod.roundCount).toBe(1);

    const round = await prisma.round.findFirstOrThrow({ where: { podId: pod.id, roundNumber: 1 } });
    expect(round.status).toBe("COMPLETED");
    const matches = await prisma.match.findMany({ where: { roundId: round.id }, orderBy: { tableNumber: "asc" } });
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ result: "A_WINS", gamesWonA: 2, gamesWonB: 0 });
    expect(matches[1]).toMatchObject({ result: "A_WINS", entrantBId: null }); // the bye
  });

  it("imports a points-only pod via finalPointsOverride when there are no rounds", async () => {
    const org = await makeOrg();
    const data: LegacyData = {
      players: ["Alice", "Bob"],
      tournaments: [
        minimalTournament({
          pods: [{ name: "Old standings", format: "SEALED", points: { Alice: 9, Bob: 3 } }],
        }),
      ],
    };

    await importLegacyData(org.id, data);
    const pod = await prisma.pod.findFirstOrThrow({ where: { name: "Old standings" } });
    const entrants = await prisma.entrant.findMany({ where: { podId: pod.id }, include: { player: true } });
    const byName = new Map(entrants.map((e) => [e.player!.displayName, e.finalPointsOverride]));
    expect(byName.get("Alice")).toBe(9);
    expect(byName.get("Bob")).toBe(3);
  });

  it("imports a team pod, deriving Bo1 games from result", async () => {
    const org = await makeOrg();
    const data: LegacyData = {
      players: ["Alice", "Bob", "Cara", "Dan"],
      tournaments: [
        minimalTournament({
          players: ["Alice", "Bob", "Cara", "Dan"],
          pods: [
            {
              name: "2HG",
              format: "DRAFT",
              isTeamEvent: true,
              teams: [
                { name: "Team A", members: ["Alice", "Bob"] },
                { name: "Team B", members: ["Cara", "Dan"] },
              ],
              rounds: [[{ a: "Team A", b: "Team B", result: "B_WINS" }]],
            },
          ],
        }),
      ],
    };

    await importLegacyData(org.id, data);
    const pod = await prisma.pod.findFirstOrThrow({ where: { name: "2HG" } });
    expect(pod.isTeamEvent).toBe(true);
    const teamA = await prisma.team.findFirstOrThrow({
      where: { podId: pod.id, name: "Team A" },
      include: { members: true },
    });
    expect(teamA.members).toHaveLength(2);
    const round = await prisma.round.findFirstOrThrow({ where: { podId: pod.id } });
    const match = await prisma.match.findFirstOrThrow({ where: { roundId: round.id } });
    expect(match).toMatchObject({ result: "B_WINS", gamesWonA: 0, gamesWonB: 1 });
  });

  it("is idempotent at the tournament level — re-importing skips an existing tournament whole", async () => {
    const org = await makeOrg();
    const data: LegacyData = { players: ["Alice"], tournaments: [minimalTournament({ players: ["Alice"] })] };

    const first = await importLegacyData(org.id, data);
    expect(first).toMatchObject({ tournamentsCreated: 1, tournamentsSkipped: 0 });

    const second = await importLegacyData(org.id, data);
    expect(second).toMatchObject({ tournamentsCreated: 0, tournamentsSkipped: 1, playersCreated: 0 });

    const tournaments = await prisma.tournament.findMany({ where: { orgId: org.id, name: "GP Weekend" } });
    expect(tournaments).toHaveLength(1);
  });

  it("rolls back the whole import when a reference is unresolvable, unlike the CLI script", async () => {
    const org = await makeOrg();
    const data: LegacyData = {
      players: ["Alice"], // "Bob" is referenced below but never listed here
      tournaments: [
        minimalTournament({
          players: ["Alice"],
          pods: [{ name: "Freitag", format: "DRAFT", points: { Alice: 3, Bob: 6 } }],
        }),
      ],
    };

    await expect(importLegacyData(org.id, data)).rejects.toThrow(/unknown player "Bob"/);

    // The whole transaction rolled back — not even the tournament survives,
    // unlike import-legacy.ts's documented partial-commit behavior.
    const tournaments = await prisma.tournament.findMany({ where: { orgId: org.id } });
    expect(tournaments).toHaveLength(0);
  });
});
