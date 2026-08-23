import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { computePodStandings } from "./standings.js";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

function closeTo(actual: number, expectedPct: number) {
  expect(actual * 100).toBeCloseTo(expectedPct, 1);
}

describe("computePodStandings", () => {
  // Reproduces the real 2025 Sommer GP Eichstätt "Battlebond" pod exactly
  // as recorded in Outline (see PLAN.md's historical reference section
  // and the source doc) — a 4-team, 3-round, best-of-1 round robin.
  // Round 1 and 2 results are stated directly in the doc; Round 3's
  // results weren't recorded there, but are uniquely determined by the
  // stated final standings (both Round 3 matches were draws) — verified
  // by hand before writing this test, see conversation/commit history.
  //
  // This is the concrete cross-check the whole standings engine is built
  // against: if this test passes, the points/MW%/GW%/OMW%/OGW% formulas
  // match what actually happened at the real event, not just what seems
  // theoretically correct.
  it("reproduces the real 2025 Sommer Battlebond final standings", async () => {
    const org = await prisma.organization.create({
      data: { slug: `battlebond-${Date.now()}`, name: "Test Org" },
    });
    const tournament = await prisma.tournament.create({
      data: { orgId: org.id, name: "2025 Sommer GP Eichstätt", startDate: new Date(), endDate: new Date() },
    });
    const pod = await prisma.pod.create({
      data: {
        tournamentId: tournament.id,
        name: "Battlebond",
        format: "DRAFT",
        sequenceOrder: 0,
        isTeamEvent: true,
        teamSize: 3,
        roundCount: 3,
        matchFormat: "BO1",
      },
    });

    const playerNames = ["Alex", "Casey", "Emery", "Tobias", "Harper", "Devon", "Finley", "Bailey", "Gray"];
    const players: Record<string, { id: string }> = {};
    for (const name of playerNames) {
      players[name] = await prisma.player.create({ data: { orgId: org.id, displayName: name } });
    }

    async function makeTeamEntrant(name: string, memberNames: string[]) {
      const team = await prisma.team.create({
        data: {
          podId: pod.id,
          name,
          members: { create: memberNames.map((n) => ({ playerId: players[n]!.id })) },
        },
      });
      return prisma.entrant.create({ data: { podId: pod.id, teamId: team.id } });
    }

    const cfk = await makeTeamEntrant("Alex+Casey+Emery", ["Alex", "Casey", "Emery"]);
    const tr = await makeTeamEntrant("Tobias+Harper", ["Tobias", "Harper"]);
    const io = await makeTeamEntrant("Devon+Finley", ["Devon", "Finley"]);
    const ds = await makeTeamEntrant("Bailey+Gray", ["Bailey", "Gray"]);

    async function playRound(
      roundNumber: number,
      matches: Array<{ a: string; b: string; result: "A_WINS" | "B_WINS" | "DRAW" }>,
    ) {
      const round = await prisma.round.create({ data: { podId: pod.id, roundNumber, status: "COMPLETED" } });
      await prisma.match.createMany({
        data: matches.map((m, i) => ({
          roundId: round.id,
          tableNumber: i + 1,
          entrantAId: m.a,
          entrantBId: m.b,
          result: m.result,
          // BO1: a decisive result is a single 1-0 game; a draw (likely
          // time-based in the original event) recorded no completed game.
          gamesWonA: m.result === "A_WINS" ? 1 : 0,
          gamesWonB: m.result === "B_WINS" ? 1 : 0,
          reportedAt: new Date(),
        })),
      });
    }

    // Round 1: Tobias+Harper vs Devon+Finley -> Devon+Finley wins 1-0
    //          Bailey+Gray vs Alex+Casey+Emery -> DRAW
    await playRound(1, [
      { a: tr.id, b: io.id, result: "B_WINS" },
      { a: ds.id, b: cfk.id, result: "DRAW" },
    ]);

    // Round 2: Devon+Finley vs Alex+Casey+Emery -> Alex+Casey+Emery wins 1-0
    //          Tobias+Harper vs Bailey+Gray -> Tobias+Harper wins 1-0
    await playRound(2, [
      { a: io.id, b: cfk.id, result: "B_WINS" },
      { a: tr.id, b: ds.id, result: "A_WINS" },
    ]);

    // Round 3: not recorded in the original doc, but uniquely determined
    // by the final standings — both were draws.
    await playRound(3, [
      { a: tr.id, b: cfk.id, result: "DRAW" },
      { a: ds.id, b: io.id, result: "DRAW" },
    ]);

    const standings = await computePodStandings(pod.id);
    const byEntrant = new Map(standings.map((s) => [s.entrantId, s]));
    const get = (entrantId: string) => {
      const row = byEntrant.get(entrantId);
      if (!row) throw new Error(`no standings row for entrant ${entrantId}`);
      return row;
    };

    // Alex+Casey+Emery: 5 pts, OMW 40.74, GW 100, OGW 44.44
    expect(get(cfk.id).points).toBe(5);
    closeTo(get(cfk.id).opponentsMatchWinPct, 40.74);
    closeTo(get(cfk.id).gameWinPct, 100);
    closeTo(get(cfk.id).opponentsGameWinPct, 44.44);

    // Tobias+Harper: 4 pts, OMW 44.44, GW 50, OGW 61.11
    expect(get(tr.id).points).toBe(4);
    closeTo(get(tr.id).opponentsMatchWinPct, 44.44);
    closeTo(get(tr.id).gameWinPct, 50);
    closeTo(get(tr.id).opponentsGameWinPct, 61.11);

    // Devon+Finley: 4 pts, OMW 44.44, GW 50, OGW 61.11
    expect(get(io.id).points).toBe(4);
    closeTo(get(io.id).opponentsMatchWinPct, 44.44);
    closeTo(get(io.id).gameWinPct, 50);
    closeTo(get(io.id).opponentsGameWinPct, 61.11);

    // Bailey+Gray: 2 pts, OMW 48.15, GW 0, OGW 66.67
    expect(get(ds.id).points).toBe(2);
    closeTo(get(ds.id).opponentsMatchWinPct, 48.15);
    closeTo(get(ds.id).gameWinPct, 0);
    closeTo(get(ds.id).opponentsGameWinPct, 66.67);

    // Final ranking: Alex+Casey+Emery 1st (5 pts), then Tobias+Harper
    // and Devon+Finley tied on points+OMW+GW+OGW (both 4/44.44/50/61.11
    // exactly), then Bailey+Gray last.
    expect(standings[0]?.entrantId).toBe(cfk.id);
    expect(standings[3]?.entrantId).toBe(ds.id);
  });

  // The history-import script (Step 10) sets Entrant.finalPointsOverride
  // for pods where only a final standings table survives from Outline, no
  // round-by-round data — this is the real 2024 GP Bad Gechingen "Mystery
  // Draft" pod's points column, an ordinary case with no ties.
  it("reports finalPointsOverride directly with zero tiebreakers, when set", async () => {
    const org = await prisma.organization.create({
      data: { slug: `override-${Date.now()}`, name: "Test Org" },
    });
    const tournament = await prisma.tournament.create({
      data: { orgId: org.id, name: "2024 GP Bad Gechingen", startDate: new Date(), endDate: new Date() },
    });
    const pod = await prisma.pod.create({
      data: { tournamentId: tournament.id, name: "Mystery Draft", format: "DRAFT", sequenceOrder: 0 },
    });

    const points: Record<string, number> = { Devon: 3, Casey: 7, Tobias: 3, Harper: 0 };
    for (const [name, pts] of Object.entries(points)) {
      const player = await prisma.player.create({ data: { orgId: org.id, displayName: name } });
      await prisma.entrant.create({ data: { podId: pod.id, playerId: player.id, finalPointsOverride: pts } });
    }

    const standings = await computePodStandings(pod.id);
    expect(standings).toHaveLength(4);
    for (const row of standings) {
      expect(row.matchWinPct).toBe(0);
      expect(row.gameWinPct).toBe(0);
      expect(row.opponentsMatchWinPct).toBe(0);
      expect(row.opponentsGameWinPct).toBe(0);
    }
    // Sorted purely by points, matching the original Outline doc (no
    // tiebreaker columns existed for these historical pods).
    expect(standings[0]?.points).toBe(7);
    expect(standings[standings.length - 1]?.points).toBe(0);
  });
});
