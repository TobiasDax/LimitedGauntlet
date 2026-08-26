// One-time history import: reads a legacy-data JSON file (see
// PLAN.md's historical reference section for the shape this expects, and
// the transcription notes for LimitedGauntlet's own real tournament
// history) and inserts it via the Prisma client directly -- this script
// never goes through the HTTP API. Idempotent: safe to re-run, existing
// rows (matched by org slug / tournament name / pod name / player name)
// are left alone rather than duplicated.
//
// The data file is deliberately NOT part of this repo (real names/results
// belong to whoever ran the tournaments, not in a public git history) --
// it's supplied at runtime, not compiled in. Run once after first deploy:
//   docker compose exec app node server/dist/scripts/import-legacy.js /path/to/legacy-data.json
// (or set LEGACY_DATA_PATH instead of passing an argument)
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient, type PodFormat, type ConstructedFormat, type MatchResult, type TournamentStatus } from "@prisma/client";
import { hashPassword } from "../auth/password.js";
import { lookupCardByName } from "../services/scryfall.js";

const prisma = new PrismaClient();

// A single match in a legacy round. Team pods (see importTeamPod) supply only
// {a, b, result} and games are derived from the result (Bo1). Individual
// standings pods supply real game scores (gamesA/gamesB, plus gamesDrawn for a
// tied game); `b: null` marks a bye.
interface LegacyMatch {
  a: string;
  b: string | null;
  result: MatchResult;
  gamesA?: number;
  gamesB?: number;
  gamesDrawn?: number;
}

interface LegacyPod {
  name: string;
  format: PodFormat;
  // Only meaningful when format === "CONSTRUCTED" — which constructed
  // format was played (PI-36). constructedFormatCustom pairs with
  // constructedFormat === "CUSTOM" for a free-text name.
  constructedFormat?: ConstructedFormat;
  constructedFormatCustom?: string;
  points?: Record<string, number>;
  cardPulls?: Array<{ cardName: string; priceEur: number }>;
  isTeamEvent?: boolean;
  teamSize?: number;
  roundCount?: number;
  matchFormat?: "BO1" | "BO3";
  teams?: Array<{ name: string; members: string[] }>;
  rounds?: LegacyMatch[][];
}

interface LegacyTournament {
  name: string;
  startDate: string;
  endDate: string;
  location: string;
  status: TournamentStatus;
  players: string[];
  pods: LegacyPod[];
}

interface LegacyData {
  players: string[];
  tournaments: LegacyTournament[];
}

async function loadLegacyData(): Promise<LegacyData> {
  const path = process.argv[2] ?? process.env.LEGACY_DATA_PATH;
  if (!path) {
    throw new Error(
      "No data file given. Pass a path as the first argument, or set LEGACY_DATA_PATH -- " +
        "see the README's 'History import' section. This file isn't part of the repo on " +
        "purpose (it's someone's real tournament history, not a fixture).",
    );
  }
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as LegacyData;
}

async function upsertOrg() {
  const slug = process.env.IMPORT_ORG_SLUG ?? "gp";
  const name = process.env.IMPORT_ORG_NAME ?? "GP";
  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) {
    console.log(`Org "${slug}" already exists, reusing it.`);
    return existing;
  }

  // Dedup guard: the slug is the only unique key, but the org NAME is not —
  // so importing again under a *different* slug would silently spawn a second
  // org with the same name. That's almost always an accident (a re-run with a
  // changed IMPORT_ORG_SLUG, or a forgotten previous import). Refuse it by
  // default; set IMPORT_ALLOW_DUPLICATE_NAME=1 to intentionally create a
  // separate org that happens to share a name.
  const nameCollision = await prisma.organization.findFirst({ where: { name } });
  if (nameCollision && process.env.IMPORT_ALLOW_DUPLICATE_NAME !== "1") {
    throw new Error(
      `An organization named "${name}" already exists under slug "${nameCollision.slug}", ` +
        `but you're importing under a different slug "${slug}". This would create a second, ` +
        `separate org with the same name.\n` +
        `  - To ADD to the existing org, re-run with IMPORT_ORG_SLUG="${nameCollision.slug}" ` +
        `(imports are idempotent — existing tournaments/pods/players are skipped).\n` +
        `  - To intentionally create a separate org sharing this name, set IMPORT_ALLOW_DUPLICATE_NAME=1.`,
    );
  }

  const org = await prisma.organization.create({
    data: { slug, name },
  });

  const email = process.env.IMPORT_ORGANIZER_EMAIL ?? "organizer@example.com";
  const password = process.env.IMPORT_ORGANIZER_PASSWORD ?? randomBytes(9).toString("base64url");
  const passwordHash = await hashPassword(password);
  await prisma.organizerAccount.create({
    data: { orgId: org.id, email, passwordHash, name: process.env.IMPORT_ORGANIZER_NAME ?? "Organizer" },
  });

  console.log(`Created org "${slug}" with organizer login ${email}`);
  if (!process.env.IMPORT_ORGANIZER_PASSWORD) {
    console.log(`  Generated password (no IMPORT_ORGANIZER_PASSWORD set): ${password}`);
    console.log("  Log in and change it -- this is only printed once.");
  }

  return org;
}

async function upsertPlayers(orgId: string, names: string[]) {
  const byName = new Map<string, { id: string }>();
  for (const name of names) {
    const existing = await prisma.player.findFirst({ where: { orgId, displayName: name } });
    byName.set(name, existing ?? (await prisma.player.create({ data: { orgId, displayName: name } })));
  }
  return byName;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Importing ~40 cards in one run genuinely trips Scryfall's rate limit
// (confirmed via a direct curl loop: real 429s, not flaky lookups -- every
// card resolves fine standalone). A real cooldown is needed, not a quick
// retry: back off for several seconds and try again, up to 3 attempts.
async function lookupWithRetry(cardName: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const card = await lookupCardByName(cardName);
      if (card) return card;
    } catch (err) {
      console.warn(`  Scryfall lookup errored for "${cardName}" (attempt ${attempt + 1}/3): ${(err as Error).message}`);
    }
    if (attempt < 2) {
      const backoffMs = 3000 * (attempt + 1);
      console.warn(`  No match yet for "${cardName}" -- backing off ${backoffMs}ms before retrying.`);
      await sleep(backoffMs);
    }
  }
  return null;
}

async function attachCardPulls(podId: string, pulls: Array<{ cardName: string; priceEur: number }> | undefined) {
  if (!pulls) return;
  for (const pull of pulls) {
    const existing = await prisma.cardPull.findFirst({ where: { podId, cardName: pull.cardName } });
    if (existing) continue;

    // Best-effort live Scryfall lookup for image/set/id, same as a real
    // add-pull -- but the historical EUR price from the doc always wins
    // over Scryfall's *current* price, since a pull is a snapshot in time.
    const card = await lookupWithRetry(pull.cardName);
    if (!card) console.warn(`  No Scryfall match for "${pull.cardName}" after retry -- imported with no image.`);

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

async function importStandingsPod(
  tournamentId: string,
  sequenceOrder: number,
  pod: LegacyPod,
  playersByName: Map<string, { id: string }>,
) {
  const existing = await prisma.pod.findFirst({ where: { tournamentId, name: pod.name } });
  if (existing) {
    console.log(`  Pod "${pod.name}" already exists, skipping entrant/round import.`);
    await attachCardPulls(existing.id, pod.cardPulls);
    return;
  }

  const hasRounds = !!pod.rounds && pod.rounds.length > 0;
  const record = await prisma.pod.create({
    data: {
      tournamentId,
      name: pod.name,
      format: pod.format,
      constructedFormat: pod.constructedFormat,
      constructedFormatCustom: pod.constructedFormatCustom,
      sequenceOrder,
      status: hasRounds || pod.points ? "COMPLETED" : "SETUP",
      ...(hasRounds ? { roundCount: pod.rounds!.length } : {}),
    },
  });

  if (hasRounds) {
    // Full round-by-round history: create one entrant per participant, then
    // real Round/Match rows so standings derives points AND tiebreakers
    // (OMW%/GW%/OGW%) from the matches — no finalPointsOverride.
    const entrantByName = new Map<string, string>();
    const entrantFor = async (name: string): Promise<string> => {
      const cached = entrantByName.get(name);
      if (cached) return cached;
      const player = playersByName.get(name);
      if (!player) throw new Error(`Pod "${pod.name}" references unknown player "${name}"`);
      const entrant = await prisma.entrant.create({ data: { podId: record.id, playerId: player.id } });
      entrantByName.set(name, entrant.id);
      return entrant.id;
    };

    for (const [i, roundMatches] of pod.rounds!.entries()) {
      const round = await prisma.round.create({ data: { podId: record.id, roundNumber: i + 1, status: "COMPLETED" } });
      for (const [tableIndex, m] of roundMatches.entries()) {
        const entrantAId = await entrantFor(m.a);
        const entrantBId = m.b === null ? null : await entrantFor(m.b);
        await prisma.match.create({
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
    // Points-only source (a final standings table with no pairings): store the
    // final total as an override; tiebreakers stay 0 since no matches exist.
    for (const [name, points] of Object.entries(pod.points)) {
      const player = playersByName.get(name);
      if (!player) throw new Error(`Pod "${pod.name}" references unknown player "${name}"`);
      await prisma.entrant.create({ data: { podId: record.id, playerId: player.id, finalPointsOverride: points } });
    }
  }

  await attachCardPulls(record.id, pod.cardPulls);
}

async function importTeamPod(
  tournamentId: string,
  sequenceOrder: number,
  pod: LegacyPod,
  playersByName: Map<string, { id: string }>,
) {
  const existing = await prisma.pod.findFirst({ where: { tournamentId, name: pod.name } });
  if (existing) {
    console.log(`  Pod "${pod.name}" already exists, skipping team/round import.`);
    await attachCardPulls(existing.id, pod.cardPulls);
    return;
  }

  const record = await prisma.pod.create({
    data: {
      tournamentId,
      name: pod.name,
      format: pod.format,
      constructedFormat: pod.constructedFormat,
      constructedFormatCustom: pod.constructedFormatCustom,
      sequenceOrder,
      status: "COMPLETED",
      isTeamEvent: true,
      teamSize: pod.teamSize ?? 2,
      roundCount: pod.roundCount ?? 3,
      matchFormat: pod.matchFormat ?? "BO1",
    },
  });

  const entrantByTeamName = new Map<string, string>();
  for (const team of pod.teams ?? []) {
    const memberIds = team.members.map((name) => {
      const player = playersByName.get(name);
      if (!player) throw new Error(`Pod "${pod.name}" team "${team.name}" references unknown player "${name}"`);
      return player.id;
    });
    const teamRecord = await prisma.team.create({
      data: { podId: record.id, name: team.name, members: { create: memberIds.map((playerId) => ({ playerId })) } },
    });
    const entrant = await prisma.entrant.create({ data: { podId: record.id, teamId: teamRecord.id } });
    entrantByTeamName.set(team.name, entrant.id);
  }

  for (const [i, roundMatches] of (pod.rounds ?? []).entries()) {
    const round = await prisma.round.create({ data: { podId: record.id, roundNumber: i + 1, status: "COMPLETED" } });
    await prisma.match.createMany({
      data: roundMatches.map((m, tableIndex) => {
        const entrantAId = entrantByTeamName.get(m.a);
        const entrantBId = m.b === null ? undefined : entrantByTeamName.get(m.b);
        if (!entrantAId || !entrantBId) throw new Error(`Pod "${pod.name}" round ${i + 1} references an unknown team`);
        return {
          roundId: round.id,
          tableNumber: tableIndex + 1,
          entrantAId,
          entrantBId,
          result: m.result,
          gamesWonA: m.result === "A_WINS" ? 1 : 0,
          gamesWonB: m.result === "B_WINS" ? 1 : 0,
          reportedAt: new Date(),
        };
      }),
    });
  }

  await attachCardPulls(record.id, pod.cardPulls);
}

async function importTournament(orgId: string, allPlayersByName: Map<string, { id: string }>, t: LegacyTournament) {
  const existing = await prisma.tournament.findFirst({ where: { orgId, name: t.name } });
  if (existing) {
    console.log(`Tournament "${t.name}" already exists (id ${existing.id}), skipping.`);
    return;
  }

  console.log(`Importing "${t.name}"...`);
  const tournament = await prisma.tournament.create({
    data: {
      orgId,
      name: t.name,
      startDate: new Date(t.startDate),
      endDate: new Date(t.endDate),
      location: t.location,
      status: t.status,
    },
  });

  for (const name of t.players) {
    const player = allPlayersByName.get(name);
    if (!player) throw new Error(`Tournament "${t.name}" references unknown player "${name}"`);
    await prisma.tournamentPlayer.create({ data: { tournamentId: tournament.id, playerId: player.id } });
  }

  for (const [i, pod] of t.pods.entries()) {
    console.log(`  Pod: ${pod.name}`);
    if (pod.isTeamEvent) {
      await importTeamPod(tournament.id, i, pod, allPlayersByName);
    } else {
      await importStandingsPod(tournament.id, i, pod, allPlayersByName);
    }
  }
}

async function main() {
  const data = await loadLegacyData();
  const org = await upsertOrg();
  const playersByName = await upsertPlayers(org.id, data.players);
  for (const tournament of data.tournaments) {
    await importTournament(org.id, playersByName, tournament);
  }
  console.log("Import complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
