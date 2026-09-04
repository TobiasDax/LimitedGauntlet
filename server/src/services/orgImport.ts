import { z } from "zod";
import {
  ConstructedFormat,
  MatchFormat,
  MatchResult,
  PodFormat,
  PodStatus,
  Prisma,
  RoundStatus,
  TournamentStatus,
} from "@prisma/client";
import { prisma } from "../prisma.js";
import { EXPORT_FORMAT_VERSION, type ExportData } from "./orgExport.js";
import { syncPodTokenAwards, zStandingBonuses } from "./tokens.js";

// Importer for LimitedGauntlet's own export format (PI-39), the counterpart to
// buildOrgExport. Imports into an EXISTING org (the caller's) rather than
// creating one. The complete import runs in one transaction and remains
// idempotent at the tournament level: a tournament whose name already exists
// in the org is skipped whole. Entrants/matches are re-linked by the same in-pod ref
// (player displayName / team name) the export wrote.

export const IMPORT_LIMITS = {
  tokenLedger: 20_000,
  players: 1_000,
  tournaments: 100,
  rosterPlayers: 1_000,
  pods: 100,
  teams: 500,
  teamMembers: 8,
  entrants: 1_000,
  rounds: 20,
  matches: 500,
  cardPulls: 1_000,
  totalRecords: 50_000,
  totalStringCharacters: 2_000_000,
} as const;

const playerName = z.string().trim().min(1).max(100);
const teamName = z.string().trim().min(1).max(100);
const isoDate = z.string().datetime({ offset: true }).max(40);

const matchSchema = z.object({
  tableNumber: z.number().int().min(1).max(10_000),
  a: z.string().trim().min(1).max(100),
  b: z.string().trim().min(1).max(100).nullable(),
  result: z.nativeEnum(MatchResult),
  gamesWonA: z.number().int().min(0).max(1_000),
  gamesWonB: z.number().int().min(0).max(1_000),
  gamesDrawn: z.number().int().min(0).max(1_000),
}).strict();

const roundSchema = z.object({
  roundNumber: z.number().int().min(1).max(IMPORT_LIMITS.rounds),
  status: z.nativeEnum(RoundStatus),
  startedAt: isoDate.nullable().optional(),
  endsAt: isoDate.nullable().optional(),
  // Optional so exports predating PI-80 still import. Whatever comes in
  // here is ignored on import anyway (see importPod) — a restored pod's
  // round 1 always comes back already revealed, since the reveal gate is
  // about a live event unfolding, not data restoration.
  pairingsRevealedAt: isoDate.nullable().optional(),
  matches: z.array(matchSchema).max(IMPORT_LIMITS.matches),
}).strict();

const entrantSchema = z.object({
  player: playerName.nullable(),
  team: teamName.nullable(),
  droppedAfterRound: z.number().int().min(0).max(IMPORT_LIMITS.rounds).nullable().optional(),
  finalPointsOverride: z.number().int().min(-10_000).max(10_000).nullable().optional(),
  manualTiebreak: z.number().int().min(0).max(IMPORT_LIMITS.entrants).nullable().optional(),
}).strict().refine((entrant) => (entrant.player === null) !== (entrant.team === null), "entrant must reference exactly one player or team");

const teamSchema = z.object({
  name: teamName,
  members: z.array(playerName).min(1).max(IMPORT_LIMITS.teamMembers),
}).strict();

const cardPullSchema = z.object({
  cardName: z.string().trim().min(1).max(200),
  player: playerName.nullable().optional(),
  playerIdInferred: z.boolean().optional(),
  scryfallId: z.string().max(64).nullable().optional(),
  setCode: z.string().max(10).nullable().optional(),
  foil: z.boolean().optional(),
  priceEur: z.number().finite().min(0).max(1_000_000).nullable().optional(),
  imageUri: z.string().max(2_048).nullable().optional(),
}).strict();

// PI-72 token config — all optional so pre-PI-72 exports still import. The
// tournament participation value is a plain int; the pod's is nullable (null =
// inherit the tournament). Both bonus lists are nullable.
const tournamentTokenFields = {
  tokenParticipation: z.number().int().min(0).max(100_000).optional(),
  tokenStandingBonuses: zStandingBonuses.nullable().optional(),
};
const podTokenFields = {
  tokenParticipation: z.number().int().min(0).max(100_000).nullable().optional(),
  tokenStandingBonuses: zStandingBonuses.nullable().optional(),
};

const tokenTxnSchema = z.object({
  player: playerName,
  delta: z.number().int().min(-1_000_000).max(1_000_000),
  reason: z.enum(["MANUAL", "INITIAL"]),
  note: z.string().max(300).nullable().optional(),
  createdAt: isoDate,
}).strict();

const podSchema = z.object({
  name: z.string().trim().min(1).max(150),
  date: isoDate.nullable().optional(),
  format: z.nativeEnum(PodFormat),
  setCode: z.string().max(10).nullable().optional(),
  constructedFormat: z.nativeEnum(ConstructedFormat).nullable().optional(),
  constructedFormatCustom: z.string().max(60).nullable().optional(),
  sequenceOrder: z.number().int().min(0).max(10_000),
  isTeamEvent: z.boolean(),
  teamSize: z.number().int().min(2).max(8).nullable().optional(),
  roundCount: z.number().int().min(1).max(IMPORT_LIMITS.rounds),
  matchFormat: z.nativeEnum(MatchFormat),
  pointsWin: z.number().int().min(-1_000).max(1_000),
  pointsDraw: z.number().int().min(-1_000).max(1_000),
  pointsLoss: z.number().int().min(-1_000).max(1_000),
  roundLengthMinutes: z.number().int().min(1).max(1_440),
  status: z.nativeEnum(PodStatus),
  excludeFromStats: z.boolean(),
  // Optional so exports predating PI-66 still import — defaults to on.
  rarePicksEnabled: z.boolean().default(true),
  ...podTokenFields,
  isMainEvent: z.boolean(),
  // Optional so exports predating PI-77/81/82/84 still import.
  completedAt: isoDate.nullable().optional().default(null),
  canceledAt: isoDate.nullable().optional().default(null),
  isOnDemand: z.boolean().optional().default(false),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional().default(null),
  actualStartedAt: isoDate.nullable().optional().default(null),
  teams: z.array(teamSchema).max(IMPORT_LIMITS.teams),
  entrants: z.array(entrantSchema).max(IMPORT_LIMITS.entrants),
  rounds: z.array(roundSchema).max(IMPORT_LIMITS.rounds),
  cardPulls: z.array(cardPullSchema).max(IMPORT_LIMITS.cardPulls),
}).strict();

const tournamentSchema = z.object({
  name: z.string().trim().min(1).max(150),
  startDate: isoDate,
  endDate: isoDate,
  location: z.string().max(200).nullable().optional(),
  description: z.string().max(10_000).nullable().optional(),
  status: z.nativeEnum(TournamentStatus),
  ...tournamentTokenFields,
  // Optional so exports predating PI-82 still import.
  podsManuallyReordered: z.boolean().optional().default(false),
  players: z.array(playerName).max(IMPORT_LIMITS.rosterPlayers),
  pods: z.array(podSchema).max(IMPORT_LIMITS.pods),
}).strict();

const dataSchema = z.object({
  players: z.array(playerName).max(IMPORT_LIMITS.players),
  tokensEnabled: z.boolean().optional().default(false),
  tokenLedger: z.array(tokenTxnSchema).max(IMPORT_LIMITS.tokenLedger).optional().default([]),
  tournaments: z.array(tournamentSchema).max(IMPORT_LIMITS.tournaments),
}).strict().superRefine((data, ctx) => {
  const tournamentNames = new Set<string>();
  for (const [tournamentIndex, tournament] of data.tournaments.entries()) {
    if (tournamentNames.has(tournament.name)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tournaments", tournamentIndex, "name"], message: "duplicate tournament name" });
    }
    tournamentNames.add(tournament.name);
    for (const [podIndex, pod] of tournament.pods.entries()) {
      const teamNames = new Set<string>();
      for (const [teamIndex, team] of pod.teams.entries()) {
        if (teamNames.has(team.name)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tournaments", tournamentIndex, "pods", podIndex, "teams", teamIndex, "name"], message: "duplicate team name" });
        }
        teamNames.add(team.name);
      }
      const entrantRefs = new Set<string>();
      for (const [entrantIndex, entrant] of pod.entrants.entries()) {
        const ref = entrant.player ?? entrant.team!;
        if (entrantRefs.has(ref)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tournaments", tournamentIndex, "pods", podIndex, "entrants", entrantIndex], message: "duplicate entrant reference" });
        }
        entrantRefs.add(ref);
      }
      const roundNumbers = new Set<number>();
      for (const [roundIndex, round] of pod.rounds.entries()) {
        if (roundNumbers.has(round.roundNumber)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tournaments", tournamentIndex, "pods", podIndex, "rounds", roundIndex, "roundNumber"], message: "duplicate round number" });
        }
        roundNumbers.add(round.roundNumber);
      }
    }
  }
});

const snapshotString = z.string().max(200);
const hallOfFameRowSchema = z.object({
  player: playerName,
  tournamentsPlayed: z.number().int().min(0),
  podsPlayed: z.number().int().min(0),
  totalPoints: z.number().finite(),
  average: z.number().finite(),
  mainEventWins: z.number().int().min(0),
}).strict();
const treasureVaultRowSchema = z.object({
  cardName: snapshotString,
  priceEur: z.number().finite().nullable(),
  player: playerName.nullable(),
  setCode: z.string().max(10).nullable(),
  foil: z.boolean(),
  podName: z.string().max(150),
  tournamentName: z.string().max(150),
}).strict();

// The full uploaded envelope. Only `data` is consumed on import — hallOfFame /
// treasureVault are derived snapshots that recompute from `data`, so they're
// accepted-and-ignored (an export that omitted `data` has nothing to import).
export const orgExportEnvelopeSchema = z.object({
  application: z.literal("limited-gauntlet"),
  formatVersion: z.number().int(),
  exportedAt: isoDate,
  organization: z.object({ slug: z.string().max(100), name: z.string().max(150) }).strict(),
  data: dataSchema.optional(),
  hallOfFame: z.array(hallOfFameRowSchema).max(IMPORT_LIMITS.totalRecords).optional(),
  treasureVault: z.array(treasureVaultRowSchema).max(IMPORT_LIMITS.totalRecords).optional(),
}).strict();

export type ParsedExportData = z.infer<typeof dataSchema>;

export interface ImportSummary {
  tournamentsCreated: number;
  tournamentsSkipped: number;
  podsCreated: number;
  playersCreated: number;
}

export interface ParseResult {
  ok: boolean;
  error?: "not_our_format" | "unsupported_version" | "no_data" | "invalid_shape" | "import_too_large";
  data?: ParsedExportData;
}

// Validate an uploaded file into an importable `data` block, or a typed error.
export function parseOrgExport(raw: unknown): ParseResult {
  const envelope = orgExportEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    // Distinguish "clearly not our file" from "our file but malformed" for a
    // clearer message in the UI.
    const looksLikeOurs =
      typeof raw === "object" && raw !== null && (raw as Record<string, unknown>).application === "limited-gauntlet";
    return { ok: false, error: looksLikeOurs ? "invalid_shape" : "not_our_format" };
  }
  if (envelope.data.formatVersion > EXPORT_FORMAT_VERSION) {
    return { ok: false, error: "unsupported_version" };
  }
  if (!envelope.data.data) {
    return { ok: false, error: "no_data" };
  }
  const budget = measureImport(envelope.data.data);
  if (budget.records > IMPORT_LIMITS.totalRecords || budget.stringCharacters > IMPORT_LIMITS.totalStringCharacters) {
    return { ok: false, error: "import_too_large" };
  }
  return { ok: true, data: envelope.data.data };
}

function measureImport(data: ParsedExportData): { records: number; stringCharacters: number } {
  let records = data.players.length + data.tournaments.length + data.tokenLedger.length;
  let stringCharacters = 0;
  const visit = (value: unknown): void => {
    if (typeof value === "string") stringCharacters += value.length;
    else if (Array.isArray(value)) for (const item of value) visit(item);
    else if (value && typeof value === "object") for (const item of Object.values(value)) visit(item);
  };
  visit(data);
  for (const tournament of data.tournaments) {
    records += tournament.players.length + tournament.pods.length;
    for (const pod of tournament.pods) {
      records += pod.teams.length + pod.entrants.length + pod.rounds.length + pod.cardPulls.length;
      for (const team of pod.teams) records += team.members.length;
      for (const round of pod.rounds) records += round.matches.length;
    }
  }
  return { records, stringCharacters };
}

export class ImportInProgressError extends Error {
  constructor() {
    super("An organization import is already running");
    this.name = "ImportInProgressError";
  }
}

let importInProgress = false;

export async function importOrgData(orgId: string, data: ParsedExportData): Promise<ImportSummary> {
  if (importInProgress) throw new ImportInProgressError();
  importInProgress = true;
  try {
    const summary = await prisma.$transaction((tx) => importOrgDataInTransaction(tx, orgId, data), {
      maxWait: 5_000,
      timeout: 120_000,
    });
    // PI-72: the POD_PARTICIPATION / POD_STANDING rows aren't in the export —
    // regenerate them from the imported pods now that everything's in place.
    // Outside the import transaction because syncPodTokenAwards runs its own.
    if (data.tokensEnabled) {
      const pods = await prisma.pod.findMany({ where: { tournament: { orgId } }, select: { id: true } });
      for (const pod of pods) await syncPodTokenAwards(pod.id);
    }
    return summary;
  } finally {
    importInProgress = false;
  }
}

async function importOrgDataInTransaction(db: Prisma.TransactionClient, orgId: string, data: ParsedExportData): Promise<ImportSummary> {
  const summary: ImportSummary = { tournamentsCreated: 0, tournamentsSkipped: 0, podsCreated: 0, playersCreated: 0 };

  // Upsert every referenced player once, up front (org-scoped, keyed on
  // displayName — the same identity the export used).
  const playerIdByName = new Map<string, string>();
  const allNames = new Set<string>(data.players);
  for (const t of data.tournaments) {
    for (const n of t.players) allNames.add(n);
    for (const pod of t.pods) {
      for (const e of pod.entrants) if (e.player) allNames.add(e.player);
      for (const team of pod.teams) for (const m of team.members) allNames.add(m);
      for (const c of pod.cardPulls) if (c.player) allNames.add(c.player);
    }
  }
  for (const name of allNames) {
    const existing = await db.player.findFirst({ where: { orgId, displayName: name } });
    if (existing) {
      playerIdByName.set(name, existing.id);
    } else {
      const created = await db.player.create({ data: { orgId, displayName: name } });
      playerIdByName.set(name, created.id);
      summary.playersCreated += 1;
    }
  }
  const playerId = (name: string): string => {
    const id = playerIdByName.get(name);
    if (!id) throw new Error(`Import references unknown player "${name}"`);
    return id;
  };

  // PI-72 — enable tokens on the target org if the file has them on (never
  // disable via import), and restore the hand-made ledger rows (deduped so a
  // re-import doesn't double them). The POD_* rows regenerate after the tx.
  if (data.tokensEnabled) {
    await db.organization.update({ where: { id: orgId }, data: { tokensEnabled: true } });
  }
  for (const txn of data.tokenLedger) {
    const createdAt = new Date(txn.createdAt);
    const pid = playerId(txn.player);
    const dupe = await db.tokenTransaction.findFirst({
      where: { orgId, playerId: pid, delta: txn.delta, reason: txn.reason, note: txn.note ?? null, createdAt },
      select: { id: true },
    });
    if (!dupe) {
      await db.tokenTransaction.create({
        data: { orgId, playerId: pid, delta: txn.delta, reason: txn.reason, note: txn.note ?? null, createdAt },
      });
    }
  }

  for (const t of data.tournaments) {
    const existing = await db.tournament.findFirst({ where: { orgId, name: t.name } });
    if (existing) {
      summary.tournamentsSkipped += 1;
      continue;
    }

    const tournament = await db.tournament.create({
      data: {
        orgId,
        name: t.name,
        startDate: new Date(t.startDate),
        endDate: new Date(t.endDate),
        location: t.location ?? null,
        description: t.description ?? null,
        status: t.status,
        tokenParticipation: t.tokenParticipation ?? 0,
        tokenStandingBonuses: t.tokenStandingBonuses ?? Prisma.DbNull,
        podsManuallyReordered: t.podsManuallyReordered,
      },
    });
    summary.tournamentsCreated += 1;

    for (const name of t.players) {
      await db.tournamentPlayer.create({ data: { tournamentId: tournament.id, playerId: playerId(name) } });
    }

    for (const pod of t.pods) {
      await importPod(db, tournament.id, pod, playerId);
      summary.podsCreated += 1;
    }
  }

  return summary;
}

async function importPod(
  db: Prisma.TransactionClient,
  tournamentId: string,
  pod: ParsedExportData["tournaments"][number]["pods"][number],
  playerId: (name: string) => string,
): Promise<void> {
  const record = await db.pod.create({
    data: {
      tournamentId,
      name: pod.name,
      date: pod.date ? new Date(pod.date) : null,
      format: pod.format,
      setCode: pod.setCode ?? null,
      constructedFormat: pod.constructedFormat ?? null,
      constructedFormatCustom: pod.constructedFormatCustom ?? null,
      sequenceOrder: pod.sequenceOrder,
      isTeamEvent: pod.isTeamEvent,
      teamSize: pod.teamSize ?? null,
      roundCount: pod.roundCount,
      matchFormat: pod.matchFormat,
      pointsWin: pod.pointsWin,
      pointsDraw: pod.pointsDraw,
      pointsLoss: pod.pointsLoss,
      roundLengthMinutes: pod.roundLengthMinutes,
      status: pod.status,
      excludeFromStats: pod.excludeFromStats,
      rarePicksEnabled: pod.rarePicksEnabled,
      tokenParticipation: pod.tokenParticipation ?? null,
      tokenStandingBonuses: pod.tokenStandingBonuses ?? Prisma.DbNull,
      isMainEvent: pod.isMainEvent,
      completedAt: pod.completedAt ? new Date(pod.completedAt) : null,
      canceledAt: pod.canceledAt ? new Date(pod.canceledAt) : null,
      isOnDemand: pod.isOnDemand,
      startTime: pod.startTime,
      actualStartedAt: pod.actualStartedAt ? new Date(pod.actualStartedAt) : null,
    },
  });

  // Teams first (entrants may reference them), tracking teamName -> teamId.
  const teamIdByName = new Map<string, string>();
  for (const team of pod.teams) {
    const created = await db.team.create({
      data: {
        podId: record.id,
        name: team.name,
        members: { create: team.members.map((m) => ({ playerId: playerId(m) })) },
      },
    });
    teamIdByName.set(team.name, created.id);
  }

  // Entrants, tracking ref (player displayName / team name) -> entrantId, the
  // key matches reference.
  const entrantIdByRef = new Map<string, string>();
  for (const e of pod.entrants) {
    if (e.team) {
      const teamId = teamIdByName.get(e.team);
      if (!teamId) throw new Error(`Pod "${pod.name}" entrant references unknown team "${e.team}"`);
      const entrant = await db.entrant.create({
        data: {
          podId: record.id,
          teamId,
          droppedAfterRound: e.droppedAfterRound ?? null,
          finalPointsOverride: e.finalPointsOverride ?? null,
          manualTiebreak: e.manualTiebreak ?? null,
        },
      });
      entrantIdByRef.set(e.team, entrant.id);
    } else if (e.player) {
      const entrant = await db.entrant.create({
        data: {
          podId: record.id,
          playerId: playerId(e.player),
          droppedAfterRound: e.droppedAfterRound ?? null,
          finalPointsOverride: e.finalPointsOverride ?? null,
          manualTiebreak: e.manualTiebreak ?? null,
        },
      });
      entrantIdByRef.set(e.player, entrant.id);
    }
  }

  const entrantId = (ref: string): string => {
    const id = entrantIdByRef.get(ref);
    if (!id) throw new Error(`Pod "${pod.name}" match references unknown entrant "${ref}"`);
    return id;
  };

  for (const round of pod.rounds) {
    const created = await db.round.create({
      data: {
        podId: record.id,
        roundNumber: round.roundNumber,
        status: round.status,
        startedAt: round.startedAt ? new Date(round.startedAt) : null,
        endsAt: round.endsAt ? new Date(round.endsAt) : null,
        // Data restoration, not a live event unfolding — always comes back
        // revealed regardless of what the export carried (see roundSchema).
        pairingsRevealedAt: new Date(),
      },
    });
    for (const m of round.matches) {
      await db.match.create({
        data: {
          roundId: created.id,
          tableNumber: m.tableNumber,
          entrantAId: entrantId(m.a),
          entrantBId: m.b === null ? null : entrantId(m.b),
          result: m.result,
          gamesWonA: m.gamesWonA,
          gamesWonB: m.gamesWonB,
          gamesDrawn: m.gamesDrawn,
          reportedAt: m.result === MatchResult.PENDING ? null : new Date(),
        },
      });
    }
  }

  for (const c of pod.cardPulls) {
    await db.cardPull.create({
      data: {
        podId: record.id,
        playerId: c.player ? playerId(c.player) : null,
        playerIdInferred: c.playerIdInferred ?? false,
        cardName: c.cardName,
        scryfallId: c.scryfallId ?? null,
        setCode: c.setCode ?? null,
        foil: c.foil ?? false,
        priceEur: c.priceEur ?? null,
        imageUri: c.imageUri ?? null,
      },
    });
  }
}
