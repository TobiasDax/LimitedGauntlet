import { z } from "zod";
import { ConstructedFormat, PodFormat, Prisma, TournamentStatus } from "../db.js";
import { prisma } from "../prisma.js";
import { lookupCardByName } from "./scryfall.js";
import { withImportLock } from "./importLock.js";
import { IMPORT_LIMITS, type ImportSummary } from "./orgImport.js";

// PI-39 — UI counterpart to server/src/scripts/import-legacy.ts's CLI-only
// history import. Same target JSON shape (see the /import-history skill's
// SKILL.md, which is the authoritative schema doc for a user producing this
// file) and the same field-level decisions (rounds > points > empty pod; a
// null `b` is a bye scored as A_WINS; team-pod games are derived from
// `result`, never supplied) — but reworked to run against THIS org (the
// caller's, already authenticated) rather than creating a new one, and
// validated with zod instead of a bare `as LegacyData` cast, since this path
// now accepts untrusted upload input instead of an operator-trusted file.
//
// Also a deliberate improvement over the CLI script: the whole import (every
// tournament in the file) runs in ONE transaction here, so a bad reference
// anywhere rolls back cleanly — the script's own docs warn it does NOT roll
// back a partially-inserted tournament on a crash. Idempotency stays at the
// tournament level only (a same-named tournament is skipped whole), matching
// both the script's actual current behavior and orgImport.ts's own posture —
// not the finer per-pod-within-an-existing-tournament granularity the skill
// doc describes, which the script's tournament-level early return can't
// actually reach.

const legacyPlayerName = z.string().trim().min(1).max(100);
const legacyDateString = z
  .string()
  .min(1)
  .max(40)
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "must be a valid date string");

const legacyMatchSchema = z
  .object({
    a: legacyPlayerName,
    b: legacyPlayerName.nullable(),
    // Deliberately narrower than the full MatchResult enum (which also has
    // PENDING) — a historical import's matches are always fully recorded,
    // matching the skill's documented allowed values exactly.
    result: z.enum(["A_WINS", "B_WINS", "DRAW"]),
    gamesA: z.number().int().min(0).max(1_000).optional(),
    gamesB: z.number().int().min(0).max(1_000).optional(),
    gamesDrawn: z.number().int().min(0).max(1_000).optional(),
  })
  .strict();

const legacyCardPullSchema = z
  .object({
    cardName: z.string().trim().min(1).max(200),
    priceEur: z.number().finite().min(0).max(1_000_000),
  })
  .strict();

const legacyTeamSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    members: z.array(legacyPlayerName).min(1).max(IMPORT_LIMITS.teamMembers),
  })
  .strict();

const legacyPodSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    format: z.nativeEnum(PodFormat),
    constructedFormat: z.nativeEnum(ConstructedFormat).optional(),
    constructedFormatCustom: z.string().max(100).optional(),
    points: z.record(legacyPlayerName, z.number().int().min(-10_000).max(10_000)).optional(),
    cardPulls: z.array(legacyCardPullSchema).max(IMPORT_LIMITS.cardPulls).optional(),
    isTeamEvent: z.boolean().optional(),
    teamSize: z.number().int().min(1).max(10).optional(),
    roundCount: z.number().int().min(1).max(IMPORT_LIMITS.rounds).optional(),
    matchFormat: z.enum(["BO1", "BO3"]).optional(),
    teams: z.array(legacyTeamSchema).max(IMPORT_LIMITS.teams).optional(),
    rounds: z.array(z.array(legacyMatchSchema).max(IMPORT_LIMITS.matches)).max(IMPORT_LIMITS.rounds).optional(),
  })
  .strict();

const legacyTournamentSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    startDate: legacyDateString,
    endDate: legacyDateString,
    location: z.string().max(200),
    status: z.nativeEnum(TournamentStatus),
    players: z.array(legacyPlayerName).max(IMPORT_LIMITS.rosterPlayers),
    pods: z.array(legacyPodSchema).max(IMPORT_LIMITS.pods),
  })
  .strict();

export const legacyDataSchema = z
  .object({
    players: z.array(legacyPlayerName).max(IMPORT_LIMITS.players),
    tournaments: z.array(legacyTournamentSchema).max(IMPORT_LIMITS.tournaments),
  })
  .strict();

export type LegacyData = z.infer<typeof legacyDataSchema>;
type LegacyPod = LegacyData["tournaments"][number]["pods"][number];

export interface LegacyParseResult {
  ok: boolean;
  error?: "not_our_format" | "invalid_shape" | "import_too_large";
  data?: LegacyData;
}

function measureLegacyImport(data: LegacyData): { records: number; stringCharacters: number } {
  let records = data.players.length;
  let stringCharacters = 0;
  const visit = (value: unknown): void => {
    if (typeof value === "string") stringCharacters += value.length;
    else if (Array.isArray(value)) for (const item of value) visit(item);
    else if (value && typeof value === "object") for (const item of Object.values(value)) visit(item);
  };
  visit(data);
  for (const t of data.tournaments) {
    records += t.players.length + t.pods.length;
    for (const pod of t.pods) {
      records += (pod.teams?.length ?? 0) + (pod.rounds?.length ?? 0) + (pod.cardPulls?.length ?? 0);
      for (const team of pod.teams ?? []) records += team.members.length;
      for (const round of pod.rounds ?? []) records += round.length;
    }
  }
  return { records, stringCharacters };
}

// Validate an uploaded file into an importable LegacyData block, or a typed
// error — same shape/intent as orgImport.ts's parseOrgExport, so the client
// error-copy switch handles either result identically.
export function parseLegacyImport(raw: unknown): LegacyParseResult {
  const looksLikeLegacy =
    typeof raw === "object" &&
    raw !== null &&
    Array.isArray((raw as Record<string, unknown>).players) &&
    Array.isArray((raw as Record<string, unknown>).tournaments);

  const parsed = legacyDataSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: looksLikeLegacy ? "invalid_shape" : "not_our_format" };
  }
  const budget = measureLegacyImport(parsed.data);
  if (budget.records > IMPORT_LIMITS.totalRecords || budget.stringCharacters > IMPORT_LIMITS.totalStringCharacters) {
    return { ok: false, error: "import_too_large" };
  }
  return { ok: true, data: parsed.data };
}

// PI-77 — same deterministic, increasing completedAt per pod within a
// tournament as import-legacy.ts: one hour after the tournament's start date
// per sequenceOrder step. Real order is all that matters for the
// finished-area sort; the exact clock time is arbitrary.
function completedAtFromSequence(startDate: Date, sequenceOrder: number): Date {
  return new Date(startDate.getTime() + sequenceOrder * 60 * 60 * 1000);
}

interface PendingCardPulls {
  podId: string;
  pulls: Array<{ cardName: string; priceEur: number }>;
}

async function importStandingsPod(
  db: Prisma.TransactionClient,
  tournamentId: string,
  sequenceOrder: number,
  pod: LegacyPod,
  playerId: (name: string) => string,
  startDate: Date,
): Promise<{ created: boolean; podId: string }> {
  const existing = await db.pod.findFirst({ where: { tournamentId, name: pod.name } });
  if (existing) return { created: false, podId: existing.id };

  const hasRounds = !!pod.rounds && pod.rounds.length > 0;
  const isComplete = hasRounds || !!pod.points;
  const record = await db.pod.create({
    data: {
      tournamentId,
      name: pod.name,
      format: pod.format,
      constructedFormat: pod.constructedFormat,
      constructedFormatCustom: pod.constructedFormatCustom,
      sequenceOrder,
      status: isComplete ? "COMPLETED" : "SETUP",
      completedAt: isComplete ? completedAtFromSequence(startDate, sequenceOrder) : null,
      ...(hasRounds ? { roundCount: pod.rounds!.length } : {}),
    },
  });

  if (hasRounds) {
    const entrantByName = new Map<string, string>();
    const entrantFor = async (name: string): Promise<string> => {
      const cached = entrantByName.get(name);
      if (cached) return cached;
      const entrant = await db.entrant.create({ data: { podId: record.id, playerId: playerId(name) } });
      entrantByName.set(name, entrant.id);
      return entrant.id;
    };

    for (const [i, roundMatches] of pod.rounds!.entries()) {
      const round = await db.round.create({
        data: { podId: record.id, roundNumber: i + 1, status: "COMPLETED", pairingsRevealedAt: new Date() },
      });
      for (const [tableIndex, m] of roundMatches.entries()) {
        const entrantAId = await entrantFor(m.a);
        const entrantBId = m.b === null ? null : await entrantFor(m.b);
        await db.match.create({
          data: {
            roundId: round.id,
            tableNumber: tableIndex + 1,
            entrantAId,
            entrantBId,
            result: m.result,
            gamesWonA: m.gamesA ?? 0,
            gamesWonB: m.gamesB ?? 0,
            gamesDrawn: m.gamesDrawn ?? 0,
            reportedAt: new Date(),
          },
        });
      }
    }
  } else if (pod.points) {
    for (const [name, points] of Object.entries(pod.points)) {
      await db.entrant.create({ data: { podId: record.id, playerId: playerId(name), finalPointsOverride: points } });
    }
  }

  return { created: true, podId: record.id };
}

async function importTeamPod(
  db: Prisma.TransactionClient,
  tournamentId: string,
  sequenceOrder: number,
  pod: LegacyPod,
  playerId: (name: string) => string,
  startDate: Date,
): Promise<{ created: boolean; podId: string }> {
  const existing = await db.pod.findFirst({ where: { tournamentId, name: pod.name } });
  if (existing) return { created: false, podId: existing.id };

  const record = await db.pod.create({
    data: {
      tournamentId,
      name: pod.name,
      format: pod.format,
      constructedFormat: pod.constructedFormat,
      constructedFormatCustom: pod.constructedFormatCustom,
      sequenceOrder,
      status: "COMPLETED",
      completedAt: completedAtFromSequence(startDate, sequenceOrder),
      isTeamEvent: true,
      teamSize: pod.teamSize ?? 2,
      roundCount: pod.roundCount ?? 3,
      matchFormat: pod.matchFormat ?? "BO1",
    },
  });

  const entrantByTeamName = new Map<string, string>();
  for (const team of pod.teams ?? []) {
    const memberIds = team.members.map((name) => playerId(name));
    const teamRecord = await db.team.create({
      data: { podId: record.id, name: team.name, members: { create: memberIds.map((pid) => ({ playerId: pid })) } },
    });
    const entrant = await db.entrant.create({ data: { podId: record.id, teamId: teamRecord.id } });
    entrantByTeamName.set(team.name, entrant.id);
  }

  for (const [i, roundMatches] of (pod.rounds ?? []).entries()) {
    const round = await db.round.create({
      data: { podId: record.id, roundNumber: i + 1, status: "COMPLETED", pairingsRevealedAt: new Date() },
    });
    for (const [tableIndex, m] of roundMatches.entries()) {
      const entrantAId = entrantByTeamName.get(m.a);
      const entrantBId = m.b === null ? undefined : entrantByTeamName.get(m.b);
      if (!entrantAId || !entrantBId) {
        throw new Error(`Pod "${pod.name}" round ${i + 1} references an unknown team`);
      }
      await db.match.create({
        data: {
          roundId: round.id,
          tableNumber: tableIndex + 1,
          entrantAId,
          entrantBId,
          result: m.result,
          gamesWonA: m.result === "A_WINS" ? 1 : 0,
          gamesWonB: m.result === "B_WINS" ? 1 : 0,
          reportedAt: new Date(),
        },
      });
    }
  }

  return { created: true, podId: record.id };
}

async function importLegacyDataInTransaction(
  db: Prisma.TransactionClient,
  orgId: string,
  data: LegacyData,
): Promise<{ summary: ImportSummary; pendingCardPulls: PendingCardPulls[] }> {
  const summary: ImportSummary = { tournamentsCreated: 0, tournamentsSkipped: 0, podsCreated: 0, playersCreated: 0 };
  const pendingCardPulls: PendingCardPulls[] = [];

  // Upsert every top-level player once, up front — org-scoped, exact-name
  // match, same identity every deeper reference (t.players, pod.points keys,
  // match a/b, team members) is checked against. A reference to a name NOT
  // in this list throws, matching import-legacy.ts's own contract.
  const playerIdByName = new Map<string, string>();
  for (const name of data.players) {
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

  for (const t of data.tournaments) {
    const existing = await db.tournament.findFirst({ where: { orgId, name: t.name } });
    if (existing) {
      summary.tournamentsSkipped += 1;
      continue;
    }

    const startDate = new Date(t.startDate);
    const tournament = await db.tournament.create({
      data: {
        orgId,
        name: t.name,
        startDate,
        endDate: new Date(t.endDate),
        location: t.location,
        status: t.status,
      },
    });
    summary.tournamentsCreated += 1;

    for (const name of t.players) {
      await db.tournamentPlayer.create({ data: { tournamentId: tournament.id, playerId: playerId(name) } });
    }

    for (const [i, pod] of t.pods.entries()) {
      const result = pod.isTeamEvent
        ? await importTeamPod(db, tournament.id, i, pod, playerId, startDate)
        : await importStandingsPod(db, tournament.id, i, pod, playerId, startDate);
      if (result.created) summary.podsCreated += 1;
      if (pod.cardPulls && pod.cardPulls.length > 0) {
        pendingCardPulls.push({ podId: result.podId, pulls: pod.cardPulls });
      }
    }
  }

  return { summary, pendingCardPulls };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Importing ~40 cards in one run genuinely trips Scryfall's rate limit — a
// real cooldown, not a quick retry: back off for several seconds and try
// again, up to 3 attempts. Kept outside the DB transaction (see file header)
// since it's slow, network-bound, and best-effort — a card pull with no
// Scryfall match still gets stored, just without an image.
async function lookupWithRetry(cardName: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const card = await lookupCardByName(cardName);
      if (card) return card;
    } catch {
      // fall through to backoff/retry below
    }
    if (attempt < 2) await sleep(3000 * (attempt + 1));
  }
  return null;
}

async function attachPendingCardPulls(pendingCardPulls: PendingCardPulls[]): Promise<void> {
  for (const { podId, pulls } of pendingCardPulls) {
    for (const pull of pulls) {
      const existing = await prisma.cardPull.findFirst({ where: { podId, cardName: pull.cardName } });
      if (existing) continue;

      const card = await lookupWithRetry(pull.cardName);
      await prisma.cardPull.create({
        data: {
          podId,
          cardName: pull.cardName,
          priceEur: pull.priceEur,
          scryfallId: card?.scryfallId ?? null,
          setCode: card?.setCode ?? null,
          imageUri: card?.imageUri ?? null,
        },
      });
      await sleep(500);
    }
  }
}

export async function importLegacyData(orgId: string, data: LegacyData): Promise<ImportSummary> {
  return withImportLock(async () => {
    const { summary, pendingCardPulls } = await prisma.$transaction(
      (tx) => importLegacyDataInTransaction(tx, orgId, data),
      { maxWait: 5_000, timeout: 120_000 },
    );
    await attachPendingCardPulls(pendingCardPulls);
    return summary;
  });
}
