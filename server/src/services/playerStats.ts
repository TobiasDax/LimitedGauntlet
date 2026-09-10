import type { PodFormat } from "../db.js";
import { prisma } from "../prisma.js";
import { computePodStandings, podIsPlayed } from "./standings.js";
import { computeGesamtwertung } from "./gesamtwertung.js";
import { computeHallOfFame } from "./hallOfFame.js";
import { getPlayerTokenBalance, isTokensEnabled } from "./tokens.js";

export interface HeadToHeadEntry {
  playerId: string;
  displayName: string;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  winPct: number;
}

export interface HallOfFameOverview {
  rankings: Awaited<ReturnType<typeof computeHallOfFame>>;
  headline: {
    tournaments: number;
    pods: number;
    players: number;
  };
  longestWinStreak: { playerId: string; displayName: string; streak: number } | null;
  // Every player-pair that has met at least once, one row per unordered
  // pair, sorted by games played together — "who's faced whom the most."
  mostPlayedPairings: Array<{
    playerAId: string;
    playerAName: string;
    playerBId: string;
    playerBName: string;
    matches: number;
  }>;
  biggestPulls: Array<{
    id: string;
    cardName: string;
    priceEur: number | null;
    imageUri: string | null;
  }>;
}

export interface PlayerStatsDetail {
  playerId: string;
  displayName: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  matchWinPct: number;
  gameWinPct: number;
  podsPlayed: number;
  tournamentsPlayed: number;
  podWins: number;
  weekendWins: number;
  longestWinStreak: number;
  bestFormat: { format: PodFormat; winPct: number; matches: number } | null;
  averageFinish: number | null;
  undefeatedPods: number;
  totalValuePulled: number;
  biggestPull: { cardName: string; priceEur: number } | null;
  cardPulls: PlayerCardPull[];
  mostPlayedOpponent: HeadToHeadEntry | null;
  nemesis: HeadToHeadEntry | null;
  victim: HeadToHeadEntry | null;
  headToHead: HeadToHeadEntry[];
  // PI-72 — the player's token balance, or null when the org has tokens off
  // (the client's single signal to hide every token surface, public included).
  tokenBalance: number | null;
  // PI-96 — every pod this player participated in, ordered oldest-first.
  podHistory: PlayerPodEntry[];
}

export interface PlayerCardPull {
  id: string;
  podId: string;
  playerId: string | null;
  playerIdInferred: boolean;
  cardName: string;
  scryfallId: string | null;
  setCode: string | null;
  priceEur: number | null;
  imageUri: string | null;
  addedAt: Date;
  pod: { id: string; name: string; tournament: { id: string; name: string } };
}

export interface PlayerPodEntry {
  podId: string;
  podName: string;
  tournamentId: string;
  tournamentName: string;
  format: PodFormat;
  date: Date | null;
  startTime: string | null;
  roundCount: number;
  rounds: { roundNumber: number; status: string }[];
  completedAt: Date | null;
  canceledAt: Date | null;
  finish: number | null;
}

interface PersonalMatch {
  podId: string;
  podFormat: PodFormat;
  opponentIds: string[];
  result: "WIN" | "LOSS" | "DRAW";
  gamesWon: number;
  gamesLost: number;
  gamesDrawn: number;
  order: number; // a chronological sort key — see buildLedger
}

interface Ledger {
  matchesByPlayer: Map<string, PersonalMatch[]>;
  headToHead: Map<string, Map<string, { wins: number; losses: number; draws: number }>>;
  nameById: Map<string, string>;
}

// A minimum number of head-to-head games before crowning a "nemesis" or
// "victim" — otherwise a single lucky/unlucky match would swing it.
const MIN_HEAD_TO_HEAD_GAMES = 2;
// A candidate nemesis/victim must themselves have played at least this many
// tournaments — someone who only ever showed up once shouldn't get branded
// the group's punching bag (or conqueror) off a single-event sample (PI-61).
const MIN_TOURNAMENTS_FOR_H2H_AWARD = 2;
// Same idea for "best format" — one match in a format that's barely been
// tried isn't a meaningful signal.
const MIN_FORMAT_MATCHES = 3;

function bumpHeadToHead(
  headToHead: Map<string, Map<string, { wins: number; losses: number; draws: number }>>,
  a: string,
  b: string,
  outcome: "WIN" | "LOSS" | "DRAW",
) {
  if (!headToHead.has(a)) headToHead.set(a, new Map());
  const row = headToHead.get(a)!;
  if (!row.has(b)) row.set(b, { wins: 0, losses: 0, draws: 0 });
  const cell = row.get(b)!;
  if (outcome === "WIN") cell.wins++;
  else if (outcome === "LOSS") cell.losses++;
  else cell.draws++;
}

// Walks every non-excluded pod in the org and builds a per-player match
// ledger (personal results, chronologically ordered) plus pairwise
// head-to-head tallies. Team matches credit each member their team's full
// result personally (one entry per player per match, not multiplied) but
// cross-product every member of side A against every member of side B for
// head-to-head, matching weekendHistory.ts's precedent for pairwise data.
async function buildLedger(orgId: string): Promise<Ledger> {
  const pods = await prisma.pod.findMany({
    where: { tournament: { orgId }, excludeFromStats: false },
    orderBy: [{ tournament: { startDate: "asc" } }, { sequenceOrder: "asc" }],
    include: {
      entrants: { include: { team: { include: { members: true } } } },
      rounds: { orderBy: { roundNumber: "asc" }, include: { matches: { orderBy: { tableNumber: "asc" } } } },
    },
  });

  const matchesByPlayer = new Map<string, PersonalMatch[]>();
  const headToHead = new Map<string, Map<string, { wins: number; losses: number; draws: number }>>();
  const push = (playerId: string, m: PersonalMatch) => {
    if (!matchesByPlayer.has(playerId)) matchesByPlayer.set(playerId, []);
    matchesByPlayer.get(playerId)!.push(m);
  };

  let order = 0;
  for (const pod of pods) {
    const entrantPlayers = new Map<string, string[]>();
    for (const entrant of pod.entrants) {
      if (entrant.playerId) entrantPlayers.set(entrant.id, [entrant.playerId]);
      else if (entrant.team)
        entrantPlayers.set(
          entrant.id,
          entrant.team.members.map((m) => m.playerId),
        );
    }

    for (const round of pod.rounds) {
      for (const match of round.matches) {
        order++;
        if (match.entrantBId === null) {
          // Bye: a clean win, no opponent to record head-to-head against.
          for (const playerId of entrantPlayers.get(match.entrantAId) ?? []) {
            push(playerId, {
              podId: pod.id,
              podFormat: pod.format,
              opponentIds: [],
              result: "WIN",
              gamesWon: 2,
              gamesLost: 0,
              gamesDrawn: 0,
              order,
            });
          }
          continue;
        }
        if (match.result === "PENDING") continue;

        const playersA = entrantPlayers.get(match.entrantAId) ?? [];
        const playersB = entrantPlayers.get(match.entrantBId) ?? [];
        const outcomeFor = (side: "A" | "B"): "WIN" | "LOSS" | "DRAW" => {
          if (match.result === "DRAW") return "DRAW";
          const winner = match.result === "A_WINS" ? "A" : "B";
          return side === winner ? "WIN" : "LOSS";
        };

        for (const pA of playersA) {
          push(pA, {
            podId: pod.id,
            podFormat: pod.format,
            opponentIds: playersB,
            result: outcomeFor("A"),
            gamesWon: match.gamesWonA,
            gamesLost: match.gamesWonB,
            gamesDrawn: match.gamesDrawn,
            order,
          });
          for (const pB of playersB) bumpHeadToHead(headToHead, pA, pB, outcomeFor("A"));
        }
        for (const pB of playersB) {
          push(pB, {
            podId: pod.id,
            podFormat: pod.format,
            opponentIds: playersA,
            result: outcomeFor("B"),
            gamesWon: match.gamesWonB,
            gamesLost: match.gamesWonA,
            gamesDrawn: match.gamesDrawn,
            order,
          });
          for (const pA of playersA) bumpHeadToHead(headToHead, pB, pA, outcomeFor("B"));
        }
      }
    }
  }

  const playerIds = new Set<string>([...matchesByPlayer.keys(), ...headToHead.keys()]);
  const players = await prisma.player.findMany({ where: { id: { in: [...playerIds] } } });
  const nameById = new Map(players.map((p) => [p.id, p.displayName]));

  return { matchesByPlayer, headToHead, nameById };
}

// Longest run of consecutive match wins, in chronological order — a bye
// counts as a win (matches the MTR convention the points/standings logic
// already uses), and is not reset at pod or tournament boundaries: it's a
// career-spanning streak, not a per-pod one.
function longestWinStreakFor(matches: PersonalMatch[]): number {
  let longest = 0;
  let current = 0;
  for (const m of matches) {
    if (m.result === "WIN") {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function headToHeadEntries(ledger: Ledger, playerId: string): HeadToHeadEntry[] {
  const row = ledger.headToHead.get(playerId);
  if (!row) return [];
  return [...row.entries()]
    .map(([opponentId, cell]) => {
      const matches = cell.wins + cell.losses + cell.draws;
      return {
        playerId: opponentId,
        displayName: ledger.nameById.get(opponentId) ?? "Unknown",
        wins: cell.wins,
        losses: cell.losses,
        draws: cell.draws,
        matches,
        winPct: matches > 0 ? cell.wins / matches : 0,
      };
    })
    .sort((a, b) => b.matches - a.matches || b.winPct - a.winPct);
}

export async function computeHallOfFameOverview(orgId: string): Promise<HallOfFameOverview> {
  const [rankings, ledger, tournamentCount, podCount, pulls] = await Promise.all([
    computeHallOfFame(orgId),
    buildLedger(orgId),
    prisma.tournament.count({ where: { orgId } }),
    // "Pods played" — only pods that have started (≥1 round) or finished
    // (COMPLETED, incl. points-only imports with no Round rows). PI-99.
    prisma.pod.count({
      where: {
        tournament: { orgId },
        excludeFromStats: false,
        OR: [{ status: "COMPLETED" }, { rounds: { some: {} } }],
      },
    }),
    prisma.cardPull.findMany({
      // rarePicksEnabled: PI-66 — pods with value tracking off don't feed the rollups.
      where: { pod: { excludeFromStats: false, rarePicksEnabled: true, tournament: { orgId } } },
      orderBy: { priceEur: "desc" },
      take: 5,
    }),
  ]);

  const seenPairs = new Set<string>();
  const mostPlayedPairings: HallOfFameOverview["mostPlayedPairings"] = [];
  for (const [playerAId, row] of ledger.headToHead) {
    for (const [playerBId, cell] of row) {
      const pairKey = [playerAId, playerBId].sort().join(":");
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      mostPlayedPairings.push({
        playerAId,
        playerAName: ledger.nameById.get(playerAId) ?? "Unknown",
        playerBId,
        playerBName: ledger.nameById.get(playerBId) ?? "Unknown",
        matches: cell.wins + cell.losses + cell.draws,
      });
    }
  }
  mostPlayedPairings.sort((a, b) => b.matches - a.matches);

  let longestWinStreak: HallOfFameOverview["longestWinStreak"] = null;
  for (const [playerId, matches] of ledger.matchesByPlayer) {
    const streak = longestWinStreakFor(matches);
    if (streak > 0 && (!longestWinStreak || streak > longestWinStreak.streak)) {
      longestWinStreak = { playerId, displayName: ledger.nameById.get(playerId) ?? "Unknown", streak };
    }
  }

  return {
    rankings,
    headline: { tournaments: tournamentCount, pods: podCount, players: rankings.length },
    longestWinStreak,
    mostPlayedPairings: mostPlayedPairings.slice(0, 5),
    biggestPulls: pulls.map((p) => ({
      id: p.id,
      cardName: p.cardName,
      priceEur: p.priceEur === null ? null : Number(p.priceEur),
      imageUri: p.imageUri,
    })),
  };
}

export async function computePlayerStats(orgId: string, playerId: string): Promise<PlayerStatsDetail | null> {
  const player = await prisma.player.findFirst({ where: { id: playerId, orgId } });
  if (!player) return null;

  const [ledger, hallOfFame, valueAgg, playerCardPulls, playerPods, tournaments] = await Promise.all([
    buildLedger(orgId),
    computeHallOfFame(orgId),
    prisma.cardPull.aggregate({
      where: { playerId, pod: { excludeFromStats: false, rarePicksEnabled: true, tournament: { orgId } } },
      _sum: { priceEur: true },
    }),
    prisma.cardPull.findMany({
      where: { playerId, pod: { excludeFromStats: false, rarePicksEnabled: true, tournament: { orgId } } },
      include: { pod: { select: { id: true, name: true, tournament: { select: { id: true, name: true } } } } },
      orderBy: { priceEur: "desc" },
    }),
    // PI-96 — all pods this player was an entrant in (any excludeFromStats), ordered
    // oldest-first, with just enough data for the pod history list + finish computation.
    prisma.pod.findMany({
      where: {
        tournament: { orgId },
        entrants: { some: { OR: [{ playerId }, { team: { members: { some: { playerId } } } }] } },
      },
      orderBy: [{ tournament: { startDate: "asc" } }, { sequenceOrder: "asc" }],
      include: {
        tournament: { select: { id: true, name: true } },
        rounds: { select: { roundNumber: true, status: true }, orderBy: { roundNumber: "asc" } },
        entrants: {
          where: { OR: [{ playerId }, { team: { members: { some: { playerId } } } }] },
          select: { id: true },
        },
      },
    }),
    prisma.tournament.findMany({ where: { orgId } }),
  ]);

  const matches = (ledger.matchesByPlayer.get(playerId) ?? []).slice().sort((a, b) => a.order - b.order);
  const wins = matches.filter((m) => m.result === "WIN").length;
  const losses = matches.filter((m) => m.result === "LOSS").length;
  const draws = matches.filter((m) => m.result === "DRAW").length;
  const gamesWon = matches.reduce((s, m) => s + m.gamesWon, 0);
  const gamesLost = matches.reduce((s, m) => s + m.gamesLost, 0);
  const gamesDrawn = matches.reduce((s, m) => s + m.gamesDrawn, 0);

  const longestWinStreak = longestWinStreakFor(matches);

  const byFormat = new Map<PodFormat, { wins: number; matches: number }>();
  const byPod = new Map<string, { losses: number }>();
  for (const m of matches) {
    if (!byFormat.has(m.podFormat)) byFormat.set(m.podFormat, { wins: 0, matches: 0 });
    const f = byFormat.get(m.podFormat)!;
    f.matches++;
    if (m.result === "WIN") f.wins++;

    if (!byPod.has(m.podId)) byPod.set(m.podId, { losses: 0 });
    if (m.result === "LOSS") byPod.get(m.podId)!.losses++;
  }
  let bestFormat: PlayerStatsDetail["bestFormat"] = null;
  for (const [format, agg] of byFormat) {
    if (agg.matches < MIN_FORMAT_MATCHES) continue;
    const winPct = agg.wins / agg.matches;
    if (!bestFormat || winPct > bestFormat.winPct) bestFormat = { format, winPct, matches: agg.matches };
  }
  const undefeatedPods = [...byPod.values()].filter((p) => p.losses === 0).length;

  // Pod wins + average finish. playerPods is already filtered to pods this
  // player was in, so entrants[0] is their entrant row. Also builds
  // finishByPodId for the pod history (PI-96).
  let podWins = 0;
  let finishSum = 0;
  let finishCount = 0;
  const finishByPodId = new Map<string, number>();
  for (const pod of playerPods) {
    const entrantId = pod.entrants[0]?.id;
    if (!entrantId) continue;
    // A not-yet-started pod has no finish — its all-zero standings would
    // otherwise hand out a phantom "1st place" and pull the average down
    // (PI-99). It still appears in `podHistory` below, just without a finish.
    if (!podIsPlayed(pod)) continue;
    const standings = await computePodStandings(pod.id);
    const rank = standings.findIndex((s) => s.entrantId === entrantId);
    if (rank === -1) continue;
    finishByPodId.set(pod.id, rank + 1);
    if (!pod.excludeFromStats) {
      finishSum += rank + 1;
      finishCount++;
      if (rank === 0) podWins++;
    }
  }

  let weekendWins = 0;
  for (const tournament of tournaments) {
    const { rows } = await computeGesamtwertung(tournament.id);
    if (rows[0]?.playerId === playerId) weekendWins++;
  }

  const tournamentsPlayedById = new Map(hallOfFame.map((r) => [r.playerId, r.tournamentsPlayed]));
  const h2h = headToHeadEntries(ledger, playerId);
  const qualifying = h2h.filter((e) => e.matches >= MIN_HEAD_TO_HEAD_GAMES);
  // Nemesis/victim only ever come from candidates who've played enough
  // tournaments themselves — a candidate who fails that bar is skipped
  // entirely (not just deprioritized), so the award naturally falls to the
  // next-best qualifying candidate instead of going straight to null.
  const eligibleForAward = qualifying.filter(
    (e) => (tournamentsPlayedById.get(e.playerId) ?? 0) >= MIN_TOURNAMENTS_FOR_H2H_AWARD,
  );
  const nemesis = eligibleForAward.length > 0 ? eligibleForAward.reduce((a, b) => (b.winPct < a.winPct ? b : a)) : null;
  const victim = eligibleForAward.length > 0 ? eligibleForAward.reduce((a, b) => (b.winPct > a.winPct ? b : a)) : null;
  const mostPlayedOpponent = h2h[0] ?? null;

  const hofRow = hallOfFame.find((r) => r.playerId === playerId);
  const gamesPlayed = gamesWon + gamesLost + gamesDrawn;
  const matchesPlayed = wins + losses + draws;
  const priceSum = valueAgg._sum.priceEur;
  const tokenBalance = (await isTokensEnabled(orgId)) ? await getPlayerTokenBalance(orgId, playerId) : null;

  const podHistory: PlayerPodEntry[] = playerPods.map((pod) => ({
    podId: pod.id,
    podName: pod.name,
    tournamentId: pod.tournament.id,
    tournamentName: pod.tournament.name,
    format: pod.format,
    date: pod.date,
    startTime: pod.startTime,
    roundCount: pod.roundCount,
    rounds: pod.rounds,
    completedAt: pod.completedAt,
    canceledAt: pod.canceledAt,
    finish: finishByPodId.get(pod.id) ?? null,
  }));

  return {
    playerId,
    displayName: player.displayName,
    matchesPlayed,
    wins,
    losses,
    draws,
    matchWinPct: matchesPlayed > 0 ? wins / matchesPlayed : 0,
    gameWinPct: gamesPlayed > 0 ? gamesWon / gamesPlayed : 0,
    podsPlayed: hofRow?.podsPlayed ?? 0,
    tournamentsPlayed: hofRow?.tournamentsPlayed ?? 0,
    podWins,
    weekendWins,
    longestWinStreak,
    bestFormat,
    averageFinish: finishCount > 0 ? finishSum / finishCount : null,
    undefeatedPods,
    totalValuePulled: priceSum === null ? 0 : Number(priceSum),
    biggestPull:
      playerCardPulls[0] && playerCardPulls[0].priceEur !== null
        ? { cardName: playerCardPulls[0].cardName, priceEur: Number(playerCardPulls[0].priceEur) }
        : null,
    cardPulls: playerCardPulls.map((p) => ({
      ...p,
      priceEur: p.priceEur === null ? null : Number(p.priceEur),
    })),
    mostPlayedOpponent,
    nemesis,
    victim,
    headToHead: h2h,
    tokenBalance,
    podHistory,
  };
}
