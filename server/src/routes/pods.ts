import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth/middleware.js";
import { findOwnedTournament, findOwnedPod, findOwnedEntrant } from "../services/ownership.js";
import { computePodStandings } from "../services/standings.js";
import { getLatestRound } from "../services/pairing.js";
import { emitPodEvent } from "../realtime.js";

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

const podCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  date: z.coerce.date().optional(),
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
  packConfig: z.string().trim().max(2000).optional(),
  rarepicUrl: z.string().trim().url().optional(),
  excludeFromStats: z.boolean().default(false),
  webhookEnabled: z.boolean().default(true),
  isMainEvent: z.boolean().default(false),
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
  date: z.coerce.date().optional(),
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
  packConfig: z.string().trim().max(2000).optional(),
  rarepicUrl: z.string().trim().url().optional(),
  status: z.enum(podStatuses).optional(),
  excludeFromStats: z.boolean().optional(),
  webhookEnabled: z.boolean().optional(),
  isMainEvent: z.boolean().optional(),
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
    const pod = await prisma.$transaction(async (tx) => {
      if (body.data.isMainEvent) {
        await tx.pod.updateMany({ where: { tournamentId: tournament.id, isMainEvent: true }, data: { isMainEvent: false } });
      }
      return tx.pod.create({ data: { ...body.data, tournamentId: tournament.id } });
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

    const pod = await prisma.$transaction(async (tx) => {
      if (body.data.isMainEvent) {
        await tx.pod.updateMany({
          where: { tournamentId: existing.tournamentId, isMainEvent: true, id: { not: existing.id } },
          data: { isMainEvent: false },
        });
      }
      await tx.pod.updateMany({
        where: { id: params.data.id, tournament: { orgId: request.organizer!.orgId } },
        data: body.data,
      });
      return tx.pod.findUnique({ where: { id: params.data.id } });
    });
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
      reply.code(201).send({ entrant });
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
    reply.code(204).send();
  });
}
