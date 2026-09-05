import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth/middleware.js";
import { findOwnedTournament, findOwnedPod, findOwnedEntrant } from "../services/ownership.js";
import { computePodStandings } from "../services/standings.js";
import { getLatestRound } from "../services/pairing.js";
import { emitPodEvent } from "../realtime.js";
import { syncPodTokenAwards, zStandingBonuses } from "../services/tokens.js";

// A pod's tokenStandingBonuses is a nullable Json column: an explicit `null`
// (organizer cleared the override → inherit the tournament) must become
// Prisma.DbNull, while an omitted field stays omitted and an array passes
// through. Returns the fragment to spread into a create/update `data`.
function tokenBonusesData(value: unknown): { tokenStandingBonuses?: Prisma.InputJsonValue | typeof Prisma.DbNull } {
  if (value === undefined) return {};
  return { tokenStandingBonuses: value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue) };
}

// Playing in any pod implies attending that pod's tournament — upsert
// keeps this true even if some of the players were already attached.
function syncTournamentAttendance(tx: Prisma.TransactionClient, tournamentId: string, playerIds: string[]) {
  return Promise.all(
    playerIds.map((playerId) =>
      tx.tournamentPlayer.upsert({
        where: { tournamentId_playerId: { tournamentId, playerId } },
        create: { tournamentId, playerId },
        update: {},
      }),
    ),
  );
}

const podFormats = ["DRAFT", "SEALED", "CHAOS_DRAFT", "CONSTRUCTED", "CUSTOM"] as const;
const constructedFormats = ["STANDARD", "MODERN", "LEGACY", "VINTAGE", "PIONEER", "PRE_MODERN", "PAUPER", "CUSTOM"] as const;
const matchFormats = ["BO1", "BO3"] as const;
const podStatuses = ["SETUP", "PAIRING", "IN_PROGRESS", "COMPLETED"] as const;

// PI-82 — "HH:MM", 24h. Kept separate from `date` (both independently optional).
const startTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const zStartTime = z.string().regex(startTimePattern, "must be HH:MM (24h)");

const podCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  date: z.coerce.date().optional(),
  startTime: zStartTime.optional(),
  format: z.enum(podFormats),
  sequenceOrder: z.number().int().min(0),
  isTeamEvent: z.boolean().default(false),
  teamSize: z.number().int().min(2).max(8).optional(),
  roundCount: z.number().int().min(1).max(20).default(3),
  matchFormat: z.enum(matchFormats).default("BO3"),
  pointsWin: z.number().int().min(0).default(3),
  pointsDraw: z.number().int().min(0).default(1),
  pointsLoss: z.number().int().min(0).default(0),
  roundLengthMinutes: z.number().int().min(1).default(50),
  excludeFromStats: z.boolean().default(false),
  rarePicksEnabled: z.boolean().default(true),
  webhookEnabled: z.boolean().default(true),
  isMainEvent: z.boolean().default(false),
  // PI-81 — explicit opt-in; every pod is "Scheduled" unless marked on-demand.
  isOnDemand: z.boolean().default(false),
  // PI-72 — per-pod override of the tournament's token rewards. null = inherit.
  tokenParticipation: z.number().int().min(0).nullable().optional(),
  tokenStandingBonuses: zStandingBonuses.nullable().optional(),
  setCode: z.string().trim().toLowerCase().min(2).max(10).optional(),
  constructedFormat: z.enum(constructedFormats).optional(),
  constructedFormatCustom: z.string().trim().min(1).max(60).optional(),
});

// Deliberately NOT `podCreateSchema.partial()` — the create schema uses
// `.default()` on several fields, and Zod re-applies defaults whenever a
// field is `undefined`, which is exactly what an omitted PATCH field
// produces. That would silently reset e.g. pointsWin back to 3 on every
// partial update that doesn't mention it. This schema has no defaults, so
// "omitted" stays "don't touch."
const podUpdateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  date: z.coerce.date().nullable().optional(),
  startTime: zStartTime.nullable().optional(),
  format: z.enum(podFormats).optional(),
  sequenceOrder: z.number().int().min(0).optional(),
  isTeamEvent: z.boolean().optional(),
  teamSize: z.number().int().min(2).max(8).optional(),
  roundCount: z.number().int().min(1).max(20).optional(),
  matchFormat: z.enum(matchFormats).optional(),
  pointsWin: z.number().int().min(0).optional(),
  pointsDraw: z.number().int().min(0).optional(),
  pointsLoss: z.number().int().min(0).optional(),
  roundLengthMinutes: z.number().int().min(1).optional(),
  status: z.enum(podStatuses).optional(),
  excludeFromStats: z.boolean().optional(),
  rarePicksEnabled: z.boolean().optional(),
  webhookEnabled: z.boolean().optional(),
  isMainEvent: z.boolean().optional(),
  isOnDemand: z.boolean().optional(),
  tokenParticipation: z.number().int().min(0).nullable().optional(),
  tokenStandingBonuses: zStandingBonuses.nullable().optional(),
  setCode: z.string().trim().toLowerCase().min(2).max(10).nullable().optional(),
  constructedFormat: z.enum(constructedFormats).nullable().optional(),
  constructedFormatCustom: z.string().trim().min(1).max(60).nullable().optional(),
});

// A constructedFormat only makes sense on a CONSTRUCTED pod, and
// constructedFormatCustom only pairs with the CUSTOM option — enforced
// here (not via Zod .refine) to match the existing isTeamEvent/teamSize
// check below, which needs the same "read body + 400" shape.
function constructedFormatError(format: string | undefined, data: {
  constructedFormat?: string | null;
  constructedFormatCustom?: string | null;
}): string | null {
  if (data.constructedFormat && format !== "CONSTRUCTED") return "constructed_format_requires_constructed_pod";
  if (data.constructedFormatCustom && data.constructedFormat !== "CUSTOM") return "constructed_format_custom_requires_custom";
  if (data.constructedFormat === "CUSTOM" && !data.constructedFormatCustom) return "constructed_format_custom_name_required";
  return null;
}

const individualEntrantSchema = z.object({ playerId: z.string().min(1) });

// Bulk add for individual pods (PI-64/65): any mix of existing roster player
// ids and brand-new player names to create-and-add. Names go through the same
// case-insensitive roster-uniqueness rule as routes/players.ts.
const bulkEntrantSchema = z.object({
  playerIds: z.array(z.string().min(1)).max(200).optional(),
  newPlayerNames: z.array(z.string().trim().min(1).max(100)).max(200).optional(),
});
const teamEntrantSchema = z.object({
  teamName: z.string().trim().min(1).max(100),
  playerIds: z
    .array(z.string().min(1))
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, "duplicate playerIds"),
});

const idParams = z.object({ id: z.string().min(1) });

const prepTimerSchema = z.object({
  minutes: z.number().int().min(1).max(600).default(50),
  label: z.string().trim().max(60).optional(),
});

// Players already committed to a pod, whether as a direct entrant or as a
// member of a team-entrant — used to reject double-booking a player into
// the same pod twice, which would otherwise silently corrupt pairing.
async function getPlayerIdsAlreadyInPod(podId: string): Promise<Set<string>> {
  const entrants = await prisma.entrant.findMany({
    where: { podId },
    include: { team: { include: { members: true } } },
  });
  const ids = new Set<string>();
  for (const entrant of entrants) {
    if (entrant.playerId) ids.add(entrant.playerId);
    if (entrant.team) for (const member of entrant.team.members) ids.add(member.playerId);
  }
  return ids;
}

export async function podRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get("/api/tournaments/:id/pods", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const tournament = await findOwnedTournament(params.data.id, request.organizer!.orgId);
    if (!tournament) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const pods = await prisma.pod.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { sequenceOrder: "asc" },
    });
    reply.send({ pods });
  });

  app.post("/api/tournaments/:id/pods", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = podCreateSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input", issues: body.success ? undefined : body.error.issues });
      return;
    }

    const tournament = await findOwnedTournament(params.data.id, request.organizer!.orgId);
    if (!tournament) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    if (body.data.isTeamEvent && !body.data.teamSize) {
      reply.code(400).send({ error: "team_size_required" });
      return;
    }

    const constructedError = constructedFormatError(body.data.format, body.data);
    if (constructedError) {
      reply.code(400).send({ error: constructedError });
      return;
    }

    // At most one main-event pod per tournament — unset any existing one
    // first so the DB's partial unique index never gets a chance to reject
    // this in normal operation (it's still the real guarantee against a
    // race, this transaction is just what makes that race unlikely).
    const { tokenStandingBonuses: _createBonuses, ...createData } = body.data;
    const pod = await prisma.$transaction(async (tx) => {
      if (body.data.isMainEvent) {
        await tx.pod.updateMany({ where: { tournamentId: tournament.id, isMainEvent: true }, data: { isMainEvent: false } });
      }
      return tx.pod.create({
        data: { ...createData, ...tokenBonusesData(_createBonuses), tournamentId: tournament.id },
      });
    });
    reply.code(201).send({ pod });
  });

  app.get("/api/pods/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const pod = await prisma.pod.findFirst({
      where: { id: params.data.id, tournament: { orgId: request.organizer!.orgId } },
      include: {
        entrants: {
          include: {
            player: true,
            team: { include: { members: { include: { player: true } } } },
          },
        },
      },
    });
    if (!pod) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    reply.send({ pod });
  });

  app.get("/api/pods/:id/standings", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const pod = await findOwnedPod(params.data.id, request.organizer!.orgId);
    if (!pod) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    const [rows, entrants] = await Promise.all([
      computePodStandings(pod.id),
      prisma.entrant.findMany({
        where: { podId: pod.id },
        include: {
          player: true,
          team: { include: { members: { include: { player: true } } } },
        },
      }),
    ]);

    const entrantById = new Map(entrants.map((e) => [e.id, e]));
    const standings = rows.map((row) => ({ ...row, entrant: entrantById.get(row.entrantId) }));

    reply.send({ standings });
  });

  app.patch("/api/pods/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = podUpdateSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    // Same "unset any sibling first" rule as create — need the pod's own
    // tournamentId to scope that, so look it up (still org-scoped) before
    // the actual update.
    const existing = await findOwnedPod(params.data.id, request.organizer!.orgId);
    if (!existing) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    const constructedError = constructedFormatError(body.data.format ?? existing.format, body.data);
    if (constructedError) {
      reply.code(400).send({ error: constructedError });
      return;
    }

    const { tokenStandingBonuses: _updateBonuses, ...updateData } = body.data;
    const pod = await prisma.$transaction(async (tx) => {
      if (body.data.isMainEvent) {
        await tx.pod.updateMany({
          where: { tournamentId: existing.tournamentId, isMainEvent: true, id: { not: existing.id } },
          data: { isMainEvent: false },
        });
      }
      await tx.pod.updateMany({
        where: { id: params.data.id, tournament: { orgId: request.organizer!.orgId } },
        data: { ...updateData, ...tokenBonusesData(_updateBonuses) },
      });
      return tx.pod.findUnique({ where: { id: params.data.id } });
    });
    // Token config may have changed — recompute this pod's auto awards (PI-72).
    await syncPodTokenAwards(params.data.id);
    reply.send({ pod });
  });

  // PI-84 — cancel a pod (event called off, never played out) as distinct
  // from it genuinely finishing. Any stage is allowed (Setup through
  // Finished) — a real-world event can be called off mid-draft, or marked
  // canceled after the fact to correct a mistake. Sets excludeFromStats
  // (covers standings/HoF/playerStats/gesamtwertung, which already check it)
  // and re-syncs token awards (which doesn't look at excludeFromStats at all
  // — syncPodTokenAwards has its own canceledAt gate for that).
  app.post("/api/pods/:id/cancel", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const existing = await findOwnedPod(params.data.id, request.organizer!.orgId);
    if (!existing) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const pod = await prisma.pod.update({
      where: { id: existing.id },
      data: { canceledAt: new Date(), excludeFromStats: true },
    });
    await syncPodTokenAwards(existing.id);
    reply.send({ pod });
  });

  // Undoes a mistaken cancel. Simple and symmetric rather than restoring
  // whatever excludeFromStats value predated the cancel (there's no history
  // of it) — the pod just goes back to counting again, matching PI-84's "at
  // minimum re-run the stats/token gate so the pod counts again if
  // appropriate" framing. No confirm needed here (PI-63's drop/undrop
  // asymmetry: canceling is consequential, undoing it isn't).
  app.post("/api/pods/:id/uncancel", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const existing = await findOwnedPod(params.data.id, request.organizer!.orgId);
    if (!existing) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const pod = await prisma.pod.update({
      where: { id: existing.id },
      data: { canceledAt: null, excludeFromStats: false },
    });
    await syncPodTokenAwards(existing.id);
    reply.send({ pod });
  });

  app.delete("/api/pods/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const { count } = await prisma.pod.deleteMany({
      where: { id: params.data.id, tournament: { orgId: request.organizer!.orgId } },
    });
    if (count === 0) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    reply.code(204).send();
  });

  // Standalone pre-round timer (PI-33) — draft / deck-building time, before any
  // round is paired. Start/replace with a length in minutes (default 50); the
  // countdown ticks client-side off `prepTimerEndsAt`. Broadcasts on the pod
  // room so every connected device (incl. public + Display Mode) updates live.
  app.post("/api/pods/:id/prep-timer", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = prepTimerSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const existing = await findOwnedPod(params.data.id, request.organizer!.orgId);
    if (!existing) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const prepTimerEndsAt = new Date(Date.now() + body.data.minutes * 60_000);
    const prepTimerLabel = body.data.label?.trim() || null;
    const pod = await prisma.pod.update({
      where: { id: existing.id },
      data: { prepTimerEndsAt, prepTimerLabel },
    });
    emitPodEvent(existing.id, "prep-timer-updated", { podId: existing.id, prepTimerEndsAt, prepTimerLabel });
    reply.send({ pod });
  });

  // Stop / clear the pre-round timer.
  app.delete("/api/pods/:id/prep-timer", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const { count } = await prisma.pod.updateMany({
      where: { id: params.data.id, tournament: { orgId: request.organizer!.orgId } },
      data: { prepTimerEndsAt: null, prepTimerLabel: null },
    });
    if (count === 0) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    emitPodEvent(params.data.id, "prep-timer-updated", { podId: params.data.id, prepTimerEndsAt: null, prepTimerLabel: null });
    reply.code(204).send();
  });

  app.post("/api/pods/:id/entrants", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const pod = await findOwnedPod(params.data.id, request.organizer!.orgId);
    if (!pod) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    if (pod.isTeamEvent) {
      const body = teamEntrantSchema.safeParse(request.body);
      if (!body.success) {
        reply.code(400).send({ error: "invalid_input", issues: body.error.issues });
        return;
      }

      if (pod.teamSize && body.data.playerIds.length !== pod.teamSize) {
        reply.code(400).send({ error: "wrong_team_size", expected: pod.teamSize, got: body.data.playerIds.length });
        return;
      }

      const players = await prisma.player.findMany({
        where: { id: { in: body.data.playerIds }, orgId: request.organizer!.orgId },
      });
      if (players.length !== body.data.playerIds.length) {
        reply.code(400).send({ error: "unknown_player" });
        return;
      }

      const alreadyInPod = await getPlayerIdsAlreadyInPod(pod.id);
      const conflicts = body.data.playerIds.filter((id) => alreadyInPod.has(id));
      if (conflicts.length > 0) {
        reply.code(409).send({ error: "already_entrant", playerIds: conflicts });
        return;
      }

      const entrant = await prisma.$transaction(async (tx) => {
        const team = await tx.team.create({
          data: {
            podId: pod.id,
            name: body.data.teamName,
            members: { create: body.data.playerIds.map((playerId) => ({ playerId })) },
          },
        });
        // Playing in a pod implies attending the tournament — keep
        // TournamentPlayer in sync so this doesn't quietly disappear from
        // the weekend coverage view and Gesamtwertung.
        await syncTournamentAttendance(tx, pod.tournamentId, body.data.playerIds);
        return tx.entrant.create({ data: { podId: pod.id, teamId: team.id } });
      });
      await syncPodTokenAwards(pod.id);
      reply.code(201).send({ entrant });
      return;
    }

    // Bulk form (PI-64/65) — checklist of existing players plus any new names
    // to create. Falls through to the legacy single-player form below when
    // neither list is present.
    const bulk = bulkEntrantSchema.safeParse(request.body);
    if (bulk.success && ((bulk.data.playerIds?.length ?? 0) > 0 || (bulk.data.newPlayerNames?.length ?? 0) > 0)) {
      const orgId = request.organizer!.orgId;
      const requestedIds = [...new Set(bulk.data.playerIds ?? [])];
      const newNames = (bulk.data.newPlayerNames ?? []).map((n) => n.trim());

      if (requestedIds.length > 0) {
        const found = await prisma.player.findMany({ where: { id: { in: requestedIds }, orgId }, select: { id: true } });
        if (found.length !== requestedIds.length) {
          reply.code(400).send({ error: "unknown_player" });
          return;
        }
      }

      // New names: unique within the request and against the existing roster,
      // case-insensitively (same rule as routes/players.ts).
      const seen = new Set<string>();
      for (const name of newNames) {
        const key = name.toLowerCase();
        if (seen.has(key)) {
          reply.code(409).send({ error: "name_taken", name });
          return;
        }
        seen.add(key);
      }
      if (newNames.length > 0) {
        const clash = await prisma.player.findFirst({
          where: { orgId, OR: newNames.map((name) => ({ displayName: { equals: name, mode: "insensitive" as const } })) },
          select: { displayName: true },
        });
        if (clash) {
          reply.code(409).send({ error: "name_taken", name: clash.displayName });
          return;
        }
      }

      const alreadyInPod = await getPlayerIdsAlreadyInPod(pod.id);
      const existingToAdd = requestedIds.filter((id) => !alreadyInPod.has(id));

      const entrants = await prisma.$transaction(async (tx) => {
        const createdPlayers = await Promise.all(
          newNames.map((displayName) => tx.player.create({ data: { orgId, displayName } })),
        );
        const playerIds = [...existingToAdd, ...createdPlayers.map((p) => p.id)];
        await syncTournamentAttendance(tx, pod.tournamentId, playerIds);
        return Promise.all(playerIds.map((playerId) => tx.entrant.create({ data: { podId: pod.id, playerId } })));
      });

      await syncPodTokenAwards(pod.id);
      reply.code(201).send({ entrants });
      return;
    }

    const body = individualEntrantSchema.safeParse(request.body);
    if (!body.success) {
      reply.code(400).send({ error: "invalid_input", issues: body.error.issues });
      return;
    }

    const player = await prisma.player.findFirst({
      where: { id: body.data.playerId, orgId: request.organizer!.orgId },
    });
    if (!player) {
      reply.code(404).send({ error: "player_not_found" });
      return;
    }

    const alreadyInPod = await getPlayerIdsAlreadyInPod(pod.id);
    if (alreadyInPod.has(player.id)) {
      reply.code(409).send({ error: "already_entrant" });
      return;
    }

    const entrant = await prisma.$transaction(async (tx) => {
      await syncTournamentAttendance(tx, pod.tournamentId, [player.id]);
      return tx.entrant.create({ data: { podId: pod.id, playerId: player.id } });
    });
    await syncPodTokenAwards(pod.id);
    reply.code(201).send({ entrant });
  });

  // Sets or clears the manual tiebreak order used to break a tie on
  // points — see the schema comment on Entrant.manualTiebreak for why this
  // exists (intentional draws to lock in placement, where the computed
  // OMW%/GW%/OGW% tiebreakers don't necessarily reflect what the group
  // actually decided). Never touches points themselves.
  app.patch("/api/entrants/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = z.object({ manualTiebreak: z.number().int().nullable() }).safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const entrant = await findOwnedEntrant(params.data.id, request.organizer!.orgId);
    if (!entrant) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    const updated = await prisma.entrant.update({
      where: { id: entrant.id },
      data: { manualTiebreak: body.data.manualTiebreak },
    });
    reply.send({ entrant: updated });
  });

  // Drop/undrop (PI-63) — only allowed between rounds, never while a round
  // is ACTIVE/PENDING. A player who leaves mid-round has that round's
  // match reported as a normal walkover result instead; the drop itself
  // only ever affects rounds not yet paired. See the Entrant.droppedAfterRound
  // schema comment for the field's exact semantics.
  app.post("/api/entrants/:id/drop", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const entrant = await findOwnedEntrant(params.data.id, request.organizer!.orgId);
    if (!entrant) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    if (entrant.droppedAfterRound !== null) {
      reply.code(409).send({ error: "already_dropped" });
      return;
    }

    const latest = await getLatestRound(entrant.podId);
    if (latest && latest.status !== "COMPLETED") {
      reply.code(400).send({ error: "round_in_progress" });
      return;
    }

    const updated = await prisma.entrant.update({
      where: { id: entrant.id },
      data: { droppedAfterRound: latest?.roundNumber ?? 0 },
    });
    await syncPodTokenAwards(entrant.podId);
    reply.send({ entrant: updated });
  });

  app.post("/api/entrants/:id/undrop", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const entrant = await findOwnedEntrant(params.data.id, request.organizer!.orgId);
    if (!entrant) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    if (entrant.droppedAfterRound === null) {
      reply.code(409).send({ error: "not_dropped" });
      return;
    }

    const latest = await getLatestRound(entrant.podId);
    if (latest && latest.status !== "COMPLETED") {
      reply.code(400).send({ error: "round_in_progress" });
      return;
    }

    const updated = await prisma.entrant.update({
      where: { id: entrant.id },
      data: { droppedAfterRound: null },
    });
    await syncPodTokenAwards(entrant.podId);
    reply.send({ entrant: updated });
  });

  app.delete("/api/entrants/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const entrant = await findOwnedEntrant(params.data.id, request.organizer!.orgId);
    if (!entrant) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    if (entrant.teamId) {
      // Cascades to the Entrant row (via Team's onDelete: Cascade on the
      // Entrant.team relation) and to the TeamMember rows.
      await prisma.team.delete({ where: { id: entrant.teamId } });
    } else {
      await prisma.entrant.delete({ where: { id: entrant.id } });
    }
    await syncPodTokenAwards(entrant.podId);
    reply.code(204).send();
  });
}
