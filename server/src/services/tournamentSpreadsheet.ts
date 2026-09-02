import writeXlsxFile from "write-excel-file/node";
import type { Row, Cell } from "write-excel-file/node";
import { prisma } from "../prisma.js";
import { computePodStandings } from "./standings.js";
import { computeGesamtwertung } from "./gesamtwertung.js";

// PI-68 — a human-readable .xlsx export of one tournament: a Tournament
// Standings sheet, a Standings sheet per pod, and one flat Matches sheet.
// (The machine round-trip format is PI-38's JSON org export; this is for
// people who want to read/print it.)

const header = (text: string): Cell => ({ value: text, fontWeight: "bold" });
const pctCell = (fraction: number): Cell => ({ type: Number, value: fraction, format: "0.00%" });

// Excel sheet names: max 31 chars, no []:*?/\ and can't be blank or a dupe.
function sheetName(base: string, used: Set<string>): string {
  let name = base.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  if (used.has(name.toLowerCase())) {
    for (let i = 2; ; i++) {
      const candidate = `${name.slice(0, 31 - String(i).length - 1)} ${i}`;
      if (!used.has(candidate.toLowerCase())) {
        name = candidate;
        break;
      }
    }
  }
  used.add(name.toLowerCase());
  return name;
}

type MatchRow = {
  tableNumber: number;
  entrantAId: string;
  entrantBId: string | null;
  gamesWonA: number;
  gamesWonB: number;
  gamesDrawn: number;
  result: "PENDING" | "A_WINS" | "B_WINS" | "DRAW";
};

function recordsFromMatches(rounds: { matches: MatchRow[] }[]): Map<string, { w: number; l: number; d: number }> {
  const rec = new Map<string, { w: number; l: number; d: number }>();
  const bump = (id: string, k: "w" | "l" | "d") => {
    const r = rec.get(id) ?? { w: 0, l: 0, d: 0 };
    r[k] += 1;
    rec.set(id, r);
  };
  for (const round of rounds) {
    for (const m of round.matches) {
      if (m.result === "PENDING") continue;
      if (m.entrantBId === null) {
        bump(m.entrantAId, "w"); // a bye is a match win
        continue;
      }
      if (m.result === "A_WINS") {
        bump(m.entrantAId, "w");
        bump(m.entrantBId, "l");
      } else if (m.result === "B_WINS") {
        bump(m.entrantBId, "w");
        bump(m.entrantAId, "l");
      } else {
        bump(m.entrantAId, "d");
        bump(m.entrantBId, "d");
      }
    }
  }
  return rec;
}

export async function buildTournamentWorkbook(
  tournamentId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const tournament = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    include: { organization: { select: { tokensEnabled: true } } },
  });

  const pods = await prisma.pod.findMany({
    where: { tournamentId },
    orderBy: { sequenceOrder: "asc" },
    include: {
      entrants: {
        include: { player: true, team: { include: { members: { include: { player: true } } } } },
      },
      rounds: {
        orderBy: { roundNumber: "asc" },
        include: { matches: { orderBy: { tableNumber: "asc" } } },
      },
    },
  });

  const { pods: gPods, rows: gRows } = await computeGesamtwertung(tournamentId);
  const players = await prisma.player.findMany({ where: { id: { in: gRows.map((r) => r.playerId) } } });
  const playerName = new Map(players.map((p) => [p.id, p.displayName]));

  const sheets: { sheet: string; data: Row[] }[] = [];
  const usedNames = new Set<string>();

  // --- Tournament Standings (Gesamtwertung) ---------------------------------
  {
    const podHeaders = gPods.map((p) => header(p.name));
    const data: Row[] = [
      [header("Rank"), header("Player"), header("Pods played"), header("Total points"), header("Avg / pod"), ...podHeaders],
    ];
    let rank = 0;
    let prevAvg: number | null = null;
    let prevTotal: number | null = null;
    gRows.forEach((row, i) => {
      const tied = row.average === prevAvg && row.totalPoints === prevTotal;
      if (!tied) rank = i + 1;
      prevAvg = row.average;
      prevTotal = row.totalPoints;
      data.push([
        rank,
        playerName.get(row.playerId) ?? row.playerId,
        row.eventsPlayed,
        row.totalPoints,
        { type: Number, value: row.average, format: "0.00" },
        ...gPods.map((p) => (row.perPod[p.id] !== undefined ? row.perPod[p.id]! : null)),
      ]);
    });
    sheets.push({ sheet: sheetName("Tournament Standings", usedNames), data });
  }

  // --- One Standings sheet per pod ----------------------------------------
  for (const pod of pods) {
    const name = new Map<string, string>();
    for (const e of pod.entrants) {
      name.set(e.id, e.player?.displayName ?? e.team?.name ?? "—");
    }
    const records = recordsFromMatches(pod.rounds);
    const standings = await computePodStandings(pod.id);

    const data: Row[] = [
      [
        header("Place"),
        header(pod.isTeamEvent ? "Team" : "Player"),
        header("Points"),
        header("W"),
        header("L"),
        header("D"),
        header("OMW%"),
        header("GW%"),
        header("OGW%"),
      ],
    ];
    standings.forEach((r, i) => {
      const rec = records.get(r.entrantId) ?? { w: 0, l: 0, d: 0 };
      data.push([
        i + 1,
        name.get(r.entrantId) ?? "—",
        r.points,
        rec.w,
        rec.l,
        rec.d,
        pctCell(r.opponentsMatchWinPct),
        pctCell(r.gameWinPct),
        pctCell(r.opponentsGameWinPct),
      ]);
    });
    sheets.push({ sheet: sheetName(pod.name || "Pod", usedNames), data });
  }

  // --- Matches (one flat sheet across every pod) --------------------------
  {
    const data: Row[] = [
      [
        header("Pod"),
        header("Round"),
        header("Table"),
        header("Player A"),
        header("Player B"),
        header("Games A"),
        header("Games B"),
        header("Draws"),
        header("Result"),
      ],
    ];
    for (const pod of pods) {
      const name = new Map<string, string>();
      for (const e of pod.entrants) name.set(e.id, e.player?.displayName ?? e.team?.name ?? "—");
      for (const round of pod.rounds) {
        for (const m of round.matches) {
          const a = name.get(m.entrantAId) ?? "—";
          const b = m.entrantBId ? (name.get(m.entrantBId) ?? "—") : "";
          const result = !m.entrantBId
            ? "Bye"
            : m.result === "PENDING"
              ? "Not played"
              : m.result === "DRAW"
                ? "Draw"
                : m.result === "A_WINS"
                  ? `${a} won`
                  : `${b} won`;
          data.push([
            pod.name,
            round.roundNumber,
            m.tableNumber,
            a,
            b,
            m.gamesWonA,
            m.gamesWonB,
            m.gamesDrawn,
            result,
          ]);
        }
      }
    }
    sheets.push({ sheet: sheetName("Matches", usedNames), data });
  }

  // --- Tokens earned this tournament (PI-72) ------------------------------
  if (tournament.organization.tokensEnabled) {
    const podIds = pods.map((p) => p.id);
    const [earned, balances] = await Promise.all([
      prisma.tokenTransaction.groupBy({
        by: ["playerId"],
        where: { podId: { in: podIds }, reason: { in: ["POD_PARTICIPATION", "POD_STANDING"] } },
        _sum: { delta: true },
      }),
      prisma.tokenTransaction.groupBy({
        by: ["playerId"],
        where: { orgId: tournament.orgId },
        _sum: { delta: true },
      }),
    ]);
    const balanceByPlayer = new Map(balances.map((b) => [b.playerId, b._sum.delta ?? 0]));
    const names = new Map(
      (await prisma.player.findMany({ where: { id: { in: earned.map((e) => e.playerId) } }, select: { id: true, displayName: true } })).map(
        (p) => [p.id, p.displayName],
      ),
    );
    const rows = earned
      .map((e) => ({ name: names.get(e.playerId) ?? "—", here: e._sum.delta ?? 0, balance: balanceByPlayer.get(e.playerId) ?? 0 }))
      .sort((a, b) => b.here - a.here || a.name.localeCompare(b.name));

    const data: Row[] = [[header("Player"), header("Tokens earned here"), header("Current balance")]];
    for (const r of rows) data.push([r.name, r.here, r.balance]);
    sheets.push({ sheet: sheetName("Tokens", usedNames), data });
  }

  const base = (tournament.name.trim() || "tournament").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return {
    buffer: await writeXlsxFile(sheets).toBuffer(),
    filename: `${base || "tournament"}.xlsx`,
  };
}
