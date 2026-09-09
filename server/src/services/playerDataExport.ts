import { prisma } from "../prisma.js";
import { computePodStandings, podIsPlayed } from "./standings.js";
import { isTokensEnabled } from "./tokens.js";

// PI-105 — a single person's copy of their own data (GDPR Art. 15 access /
// Art. 20 portability). Everything tied to one Player row in one org, in a
// readable JSON shape. Reachable two ways: an organizer pulls it for a roster
// player (routes/players.ts), or a logged-in player pulls their own
// (routes/playerAccounts.ts). Deliberately not the PI-38 org-export format —
// this is a human-readable subject-access response, not a re-importable dump.

export interface PlayerDataExportMatch {
  tournament: string;
  pod: string;
  round: number;
  opponent: string | null; // null = bye
  result: "win" | "loss" | "draw" | "pending";
  gamesFor: number;
  gamesAgainst: number;
  gamesDrawn: number;
}

export interface PlayerDataExport {
  application: "limited-gauntlet";
  kind: "player-data-export";
  exportedAt: string;
  organization: { slug: string; name: string };
  player: {
    displayName: string;
    createdAt: string;
    loginEmail: string | null;
    hasLogin: boolean;
    anonymised: boolean;
    hiddenFromPublicPages: boolean;
  };
  tournaments: Array<{ name: string; startDate: string; endDate: string; checkedIn: boolean }>;
  pods: Array<{
    tournament: string;
    pod: string;
    format: string;
    date: string | null;
    team: string | null;
    droppedAfterRound: number | null;
    finish: number | null;
  }>;
  matches: PlayerDataExportMatch[];
  cardPulls: Array<{
    tournament: string;
    pod: string;
    cardName: string;
    setCode: string | null;
    foil: boolean;
    priceEur: number | null;
    attributionInferred: boolean;
    addedAt: string;
  }>;
  // null when the org has tokens turned off (nothing was ever recorded).
  tokenLedger: Array<{
    delta: number;
    reason: string;
    note: string | null;
    pod: string | null;
    createdAt: string;
  }> | null;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

// A safe `content-disposition` filename for a player-data export.
export function playerExportFilename(displayName: string): string {
  const slug = displayName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "player";
  return `limited-gauntlet-${slug}-data.json`;
}

function entrantName(
  e: { player: { displayName: string } | null; team: { name: string } | null } | null,
): string | null {
  if (!e) return null;
  return e.player?.displayName ?? e.team?.name ?? null;
}

export async function buildPlayerDataExport(orgId: string, playerId: string): Promise<PlayerDataExport | null> {
  const player = await prisma.player.findFirst({ where: { id: playerId, orgId } });
  if (!player) return null;

  const [organization, checkIns, entrants, cardPulls, tokensOn] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { slug: true, name: true } }),
    prisma.tournamentPlayer.findMany({
      where: { playerId, tournament: { orgId } },
      include: { tournament: { select: { name: true, startDate: true, endDate: true } } },
    }),
    prisma.entrant.findMany({
      where: {
        pod: { tournament: { orgId } },
        OR: [{ playerId }, { team: { members: { some: { playerId } } } }],
      },
      include: {
        team: { select: { name: true } },
        pod: {
          select: {
            id: true,
            name: true,
            format: true,
            date: true,
            status: true,
            rounds: { select: { id: true } },
            tournament: { select: { name: true, startDate: true, endDate: true } },
          },
        },
        matchesAsA: {
          include: {
            round: { select: { roundNumber: true } },
            entrantB: { include: { player: { select: { displayName: true } }, team: { select: { name: true } } } },
          },
        },
        matchesAsB: {
          include: {
            round: { select: { roundNumber: true } },
            entrantA: { include: { player: { select: { displayName: true } }, team: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.cardPull.findMany({
      where: { playerId, pod: { tournament: { orgId } } },
      include: { pod: { select: { name: true, tournament: { select: { name: true } } } } },
      orderBy: { addedAt: "asc" },
    }),
    isTokensEnabled(orgId),
  ]);

  // Stable chronological order for pods/matches: by the tournament's start
  // date, then the pod name.
  const sortedEntrants = [...entrants].sort(
    (a, b) =>
      a.pod.tournament.startDate.getTime() - b.pod.tournament.startDate.getTime() ||
      a.pod.name.localeCompare(b.pod.name),
  );

  const checkedInTournamentNames = new Set(checkIns.map((c) => c.tournament.name));
  const tournamentsByName = new Map<string, { name: string; startDate: string; endDate: string }>();
  const noteTournament = (t: { name: string; startDate: Date; endDate: Date }) => {
    tournamentsByName.set(t.name, {
      name: t.name,
      startDate: t.startDate.toISOString(),
      endDate: t.endDate.toISOString(),
    });
  };
  for (const c of checkIns) noteTournament(c.tournament);
  for (const e of sortedEntrants) noteTournament(e.pod.tournament);

  const pods: PlayerDataExport["pods"] = [];
  const matches: PlayerDataExportMatch[] = [];

  for (const entrant of sortedEntrants) {
    const pod = entrant.pod;

    let finish: number | null = null;
    if (podIsPlayed({ status: pod.status, rounds: pod.rounds })) {
      const standings = await computePodStandings(pod.id);
      const rank = standings.findIndex((s) => s.entrantId === entrant.id);
      if (rank !== -1) finish = rank + 1;
    }

    pods.push({
      tournament: pod.tournament.name,
      pod: pod.name,
      format: pod.format,
      date: iso(pod.date),
      team: entrant.team?.name ?? null,
      droppedAfterRound: entrant.droppedAfterRound,
      finish,
    });

    for (const m of entrant.matchesAsA) {
      matches.push({
        tournament: pod.tournament.name,
        pod: pod.name,
        round: m.round.roundNumber,
        opponent: entrantName(m.entrantB),
        result:
          m.result === "PENDING" ? "pending" : m.result === "A_WINS" ? "win" : m.result === "B_WINS" ? "loss" : "draw",
        gamesFor: m.gamesWonA,
        gamesAgainst: m.gamesWonB,
        gamesDrawn: m.gamesDrawn,
      });
    }
    for (const m of entrant.matchesAsB) {
      matches.push({
        tournament: pod.tournament.name,
        pod: pod.name,
        round: m.round.roundNumber,
        opponent: entrantName(m.entrantA),
        result:
          m.result === "PENDING" ? "pending" : m.result === "B_WINS" ? "win" : m.result === "A_WINS" ? "loss" : "draw",
        gamesFor: m.gamesWonB,
        gamesAgainst: m.gamesWonA,
        gamesDrawn: m.gamesDrawn,
      });
    }
  }

  matches.sort((a, b) => a.tournament.localeCompare(b.tournament) || a.pod.localeCompare(b.pod) || a.round - b.round);

  let tokenLedger: PlayerDataExport["tokenLedger"] = null;
  if (tokensOn) {
    const rows = await prisma.tokenTransaction.findMany({
      where: { orgId, playerId },
      orderBy: { createdAt: "asc" },
      include: { pod: { select: { name: true } } },
    });
    tokenLedger = rows.map((r) => ({
      delta: r.delta,
      reason: r.reason,
      note: r.note,
      pod: r.pod?.name ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  return {
    application: "limited-gauntlet",
    kind: "player-data-export",
    exportedAt: new Date().toISOString(),
    organization: { slug: organization.slug, name: organization.name },
    player: {
      displayName: player.displayName,
      createdAt: player.createdAt.toISOString(),
      loginEmail: player.email,
      hasLogin: player.identityId !== null,
      anonymised: player.anonymisedAt !== null,
      hiddenFromPublicPages: player.publicHiddenAt !== null,
    },
    tournaments: [...tournamentsByName.values()]
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map((t) => ({ ...t, checkedIn: checkedInTournamentNames.has(t.name) })),
    pods,
    matches,
    cardPulls: cardPulls.map((c) => ({
      tournament: c.pod.tournament.name,
      pod: c.pod.name,
      cardName: c.cardName,
      setCode: c.setCode,
      foil: c.foil,
      priceEur: c.priceEur === null ? null : Number(c.priceEur),
      attributionInferred: c.playerIdInferred,
      addedAt: c.addedAt.toISOString(),
    })),
    tokenLedger,
  };
}
