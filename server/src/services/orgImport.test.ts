import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { IMPORT_LIMITS, importOrgData, parseOrgExport } from "./orgImport.js";
import { buildOrgExport } from "./orgExport.js";
import { recordManualTokenTxn, syncPodTokenAwards, getPlayerTokenBalance } from "./tokens.js";

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

const prisma = new PrismaClient();
afterAll(async () => {
  await prisma.$disconnect();
});

describe("token export → import round-trip (PI-72)", () => {
  it("carries tokensEnabled, the config, the manual ledger, and regenerates auto rows", async () => {
    const u = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const src = await prisma.organization.create({ data: { slug: `xr-src-${u}`, name: "Src", tokensEnabled: true } });
    const organizer = await prisma.organizerAccount.create({
      data: { orgId: src.id, name: "O", email: `o-${u}@x.com`, passwordHash: "x" },
    });
    const tournament = await prisma.tournament.create({
      data: {
        orgId: src.id,
        name: "GP",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-02"),
        tokenParticipation: 5,
        tokenStandingBonuses: [{ fromPlace: 1, toPlace: 1, tokens: 10 }],
      },
    });
    const alice = await prisma.player.create({ data: { orgId: src.id, displayName: "Alice" } });
    const bob = await prisma.player.create({ data: { orgId: src.id, displayName: "Bob" } });
    const pod = await prisma.pod.create({
      data: { tournamentId: tournament.id, name: "Freitag", format: "DRAFT", sequenceOrder: 0, roundCount: 1 },
    });
    const eA = await prisma.entrant.create({ data: { podId: pod.id, playerId: alice.id } });
    const eB = await prisma.entrant.create({ data: { podId: pod.id, playerId: bob.id } });
    const round = await prisma.round.create({ data: { podId: pod.id, roundNumber: 1, status: "ACTIVE" } });
    await prisma.match.create({
      data: { roundId: round.id, tableNumber: 1, entrantAId: eA.id, entrantBId: eB.id, result: "A_WINS", gamesWonA: 2, reportedAt: new Date() },
    });
    await prisma.round.update({ where: { id: round.id }, data: { status: "COMPLETED" } });
    await syncPodTokenAwards(pod.id); // Alice +15 auto, Bob +5 auto
    await recordManualTokenTxn(src.id, alice.id, organizer.id, { delta: 50, note: "seed" });

    const exported = await buildOrgExport(src.id, { data: true, hallOfFame: false, treasureVault: false });
    const parsed = parseOrgExport(exported);
    expect(parsed.ok).toBe(true);

    const dest = await prisma.organization.create({ data: { slug: `xr-dst-${u}`, name: "Dst" } });
    await importOrgData(dest.id, parsed.data!);

    const destOrg = await prisma.organization.findUniqueOrThrow({ where: { id: dest.id } });
    expect(destOrg.tokensEnabled).toBe(true);
    const destTournament = await prisma.tournament.findFirstOrThrow({ where: { orgId: dest.id, name: "GP" } });
    expect(destTournament.tokenParticipation).toBe(5);
    expect(destTournament.tokenStandingBonuses).toEqual([{ fromPlace: 1, toPlace: 1, tokens: 10 }]);

    const destAlice = await prisma.player.findFirstOrThrow({ where: { orgId: dest.id, displayName: "Alice" } });
    // manual 50 + regenerated auto (participation 5 + standing 10) = 65
    expect(await getPlayerTokenBalance(dest.id, destAlice.id)).toBe(65);

    // Re-import is idempotent — the manual row isn't doubled.
    await importOrgData(dest.id, parsed.data!);
    expect(await getPlayerTokenBalance(dest.id, destAlice.id)).toBe(65);
  });
});
