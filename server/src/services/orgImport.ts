import { z } from "zod";
import {
  ConstructedFormat,
  MatchFormat,
  MatchResult,
  PodFormat,
  PodStatus,
  RoundStatus,
  TournamentStatus,
} from "@prisma/client";
import { prisma } from "../prisma.js";
import { EXPORT_FORMAT_VERSION, type ExportData } from "./orgExport.js";

// Importer for LimitedGauntlet's own export format (PI-39), the counterpart to
// buildOrgExport. Imports into an EXISTING org (the caller's) rather than
// creating one. Like the history import (import-legacy.ts) it's non-
// transactional and idempotent at the tournament level: a tournament whose
// name already exists in the org is skipped whole, so re-running a partial
// import is safe. Entrants/matches are re-linked by the same in-pod ref
// (player displayName / team name) the export wrote.

const matchSchema = z.object({
  tableNumber: z.number().int(),
  a: z.string().min(1),
  b: z.string().min(1).nullable(),
  result: z.nativeEnum(MatchResult),
  gamesWonA: z.number().int().min(0),
  gamesWonB: z.number().int().min(0),
  gamesDrawn: z.number().int().min(0),
});

const roundSchema = z.object({
  roundNumber: z.number().int(),
  status: z.nativeEnum(RoundStatus),
  startedAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  matches: z.array(matchSchema),
});

const entrantSchema = z.object({
  player: z.string().min(1).nullable(),
  team: z.string().min(1).nullable(),
  droppedAfterRound: z.number().int().nullable().optional(),
  finalPointsOverride: z.number().int().nullable().optional(),
  manualTiebreak: z.number().int().nullable().optional(),
});

const teamSchema = z.object({
  name: z.string().min(1),
  members: z.array(z.string().min(1)),
});

const cardPullSchema = z.object({
  cardName: z.string().min(1),
  player: z.string().min(1).nullable().optional(),
  playerIdInferred: z.boolean().optional(),
  scryfallId: z.string().nullable().optional(),
  setCode: z.string().nullable().optional(),
  foil: z.boolean().optional(),
  priceEur: z.number().nullable().optional(),
  imageUri: z.string().nullable().optional(),
});

const podSchema = z.object({
  name: z.string().min(1),
  date: z.string().nullable().optional(),
  format: z.nativeEnum(PodFormat),
  setCode: z.string().nullable().optional(),
  constructedFormat: z.nativeEnum(ConstructedFormat).nullable().optional(),
  constructedFormatCustom: z.string().nullable().optional(),
  sequenceOrder: z.number().int(),
  isTeamEvent: z.boolean(),
  teamSize: z.number().int().nullable().optional(),
  roundCount: z.number().int(),
  matchFormat: z.nativeEnum(MatchFormat),
  pointsWin: z.number().int(),
  pointsDraw: z.number().int(),
  pointsLoss: z.number().int(),
  roundLengthMinutes: z.number().int(),
  status: z.nativeEnum(PodStatus),
  excludeFromStats: z.boolean(),
  isMainEvent: z.boolean(),
  teams: z.array(teamSchema),
  entrants: z.array(entrantSchema),
  rounds: z.array(roundSchema),
  cardPulls: z.array(cardPullSchema),
});

const tournamentSchema = z.object({
  name: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
  location: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.nativeEnum(TournamentStatus),
  players: z.array(z.string().min(1)),
  pods: z.array(podSchema),
});

const dataSchema = z.object({
  players: z.array(z.string().min(1)),
  tournaments: z.array(tournamentSchema),
});

// The full uploaded envelope. Only `data` is consumed on import — hallOfFame /
// treasureVault are derived snapshots that recompute from `data`, so they're
// accepted-and-ignored (an export that omitted `data` has nothing to import).
export const orgExportEnvelopeSchema = z.object({
  application: z.literal("limited-gauntlet"),
  formatVersion: z.number().int(),
  data: dataSchema.optional(),
});

export type ParsedExportData = z.infer<typeof dataSchema>;

export interface ImportSummary {
  tournamentsCreated: number;
  tournamentsSkipped: number;
  podsCreated: number;
  playersCreated: number;
}

export interface ParseResult {
  ok: boolean;
  error?: "not_our_format" | "unsupported_version" | "no_data" | "invalid_shape";
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
  return { ok: true, data: envelope.data.data };
}

export async function importOrgData(orgId: string, data: ParsedExportData): Promise<ImportSummary> {
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
    const existing = await prisma.player.findFirst({ where: { orgId, displayName: name } });
    if (existing) {
      playerIdByName.set(name, existing.id);
    } else {
      const created = await prisma.player.create({ data: { orgId, displayName: name } });
      playerIdByName.set(name, created.id);
      summary.playersCreated += 1;
    }
  }
  const playerId = (name: string): string => {
    const id = playerIdByName.get(name);
    if (!id) throw new Error(`Import references unknown player "${name}"`);
    return id;
  };

  for (const t of data.tournaments) {
    const existing = await prisma.tournament.findFirst({ where: { orgId, name: t.name } });
    if (existing) {
      summary.tournamentsSkipped += 1;
      continue;
    }

    const tournament = await prisma.tournament.create({
      data: {
        orgId,
        name: t.name,
        startDate: new Date(t.startDate),
        endDate: new Date(t.endDate),
        location: t.location ?? null,
        description: t.description ?? null,
        status: t.status,
      },
    });
    summary.tournamentsCreated += 1;

    for (const name of t.players) {
      await prisma.tournamentPlayer.create({ data: { tournamentId: tournament.id, playerId: playerId(name) } });
    }

    for (const pod of t.pods) {
      await importPod(tournament.id, pod, playerId);
      summary.podsCreated += 1;
    }
  }

  return summary;
}

async function importPod(
  tournamentId: string,
  pod: ParsedExportData["tournaments"][number]["pods"][number],
  playerId: (name: string) => string,
): Promise<void> {
  const record = await prisma.pod.create({
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
      isMainEvent: pod.isMainEvent,
    },
  });

  // Teams first (entrants may reference them), tracking teamName -> teamId.
  const teamIdByName = new Map<string, string>();
  for (const team of pod.teams) {
    const created = await prisma.team.create({
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
      const entrant = await prisma.entrant.create({
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
      const entrant = await prisma.entrant.create({
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
    const created = await prisma.round.create({
      data: {
        podId: record.id,
        roundNumber: round.roundNumber,
        status: round.status,
        startedAt: round.startedAt ? new Date(round.startedAt) : null,
        endsAt: round.endsAt ? new Date(round.endsAt) : null,
      },
    });
    for (const m of round.matches) {
      await prisma.match.create({
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
    await prisma.cardPull.create({
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
