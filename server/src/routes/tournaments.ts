import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth/middleware.js";
import { requireOrgDataAccessible } from "../auth/entitlementGate.js";
import { findOwnedTournament } from "../services/ownership.js";
import { computePlayerPairHistory } from "../services/weekendHistory.js";
import { computeGesamtwertung, countTournamentParticipants } from "../services/gesamtwertung.js";
import { buildTournamentWorkbook } from "../services/tournamentSpreadsheet.js";
import { zStandingBonuses, syncPodTokenAwards } from "../services/tokens.js";
import {
  canCreateTournament,
  claimTournamentCoverage,
  ENTITLEMENT_REQUIRED,
  orgAllows,
  orgAllowsTournamentSpan,
  orgMaxTournamentDays,
} from "../services/entitlementAccess.js";

const tournamentCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  location: z.string().trim().max(200).optional(),
  // Roomy cap for detailed Markdown descriptions (PI-31): headings, lists, tables.
  description: z.string().trim().max(10000).optional(),
});

const tournamentUpdateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  location: z.string().trim().max(200).optional(),
  // nullable so the description can be cleared back to empty
  description: z.string().trim().max(10000).nullable().optional(),
  status: z.enum(["PLANNING", "ACTIVE", "COMPLETED"]).optional(),
  // Default token rewards (PI-72) — stored regardless of Organization.tokensEnabled.
  tokenParticipation: z.number().int().min(0).optional(),
  tokenStandingBonuses: zStandingBonuses.optional(),
  // PI-140 — organizer-only notes. Nullable so they can be cleared back to
  // empty, same as `description` above. Same generous cap: these accumulate
  // over a weekend.
  internalNotes: z.string().trim().max(10000).nullable().optional(),
});

const idParams = z.object({ id: z.string().min(1) });
const playerIdParams = z.object({ id: z.string().min(1), playerId: z.string().min(1) });

// PI-76 — bulk pod reorder: the client posts the full pod list in its
// desired order; each pod's sequenceOrder becomes its index in that array.
const podOrderSchema = z.object({
  podIds: z.array(z.string().min(1)).min(1).max(1000),
});

export async function tournamentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);
  // HI-4 — refuse reads once the retention window has run out.
  app.addHook("preHandler", requireOrgDataAccessible);

  app.get("/api/tournaments", async (request, reply) => {
    const tournaments = await prisma.tournament.findMany({
      where: { orgId: request.organizer!.orgId },
      orderBy: { startDate: "desc" },
    });
    reply.send({ tournaments });
  });

  app.post("/api/tournaments", async (request, reply) => {
    const parsed = tournamentCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input", issues: parsed.error.issues });
      return;
    }

    const orgId = request.organizer!.orgId;

    // HI-4 — both checks are no-ops unless the deployment opted into hosted
    // entitlements, so a self-hosted instance falls straight through.
    if (!(await canCreateTournament(orgId))) {
      reply.code(402).send({ error: ENTITLEMENT_REQUIRED, reason: "tournament_limit" });
      return;
    }
    if (!(await orgAllowsTournamentSpan(orgId, parsed.data.startDate, parsed.data.endDate))) {
      reply.code(402).send({
        error: ENTITLEMENT_REQUIRED,
        reason: "tournament_duration",
        maxDays: await orgMaxTournamentDays(orgId),
      });
      return;
    }

    const tournament = await prisma.tournament.create({
      data: { ...parsed.data, orgId },
    });
    // Consumes the free slot or an unused pass. Throws only if a concurrent
    // create beat this one to the last entitlement, which the 402 above
    // normally prevents.
    await claimTournamentCoverage(orgId, tournament.id);

    reply.code(201).send({ tournament });
  });

  app.get("/api/tournaments/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const tournament = await prisma.tournament.findFirst({
      where: { id: params.data.id, orgId: request.organizer!.orgId },
      include: {
        pods: {
          orderBy: { sequenceOrder: "asc" },
          include: {
            rounds: { select: { roundNumber: true, status: true }, orderBy: { roundNumber: "asc" } },
            entrants: { select: { playerId: true, team: { select: { members: { select: { playerId: true } } } } } },
          },
        },
        players: { include: { player: true } },
      },
    });
    if (!tournament) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const playersPlayed = countTournamentParticipants(tournament.pods);
    const pods = tournament.pods.map(({ entrants, ...pod }) => ({ ...pod, entrantCount: entrants.length }));
    // PI-140 — resolve the notes editor to a name for display. Looked up
    // separately rather than via a relation: the id is a plain column (no FK),
    // so a co-organizer who has since been removed leaves the notes readable
    // with their attribution simply unresolved instead of breaking the page.
    const notesEditor = tournament.internalNotesEditedById
      ? await prisma.organizerAccount.findUnique({
          where: { id: tournament.internalNotesEditedById },
          select: { name: true },
        })
      : null;
    reply.send({
      tournament: { ...tournament, pods, playersPlayed, internalNotesEditedByName: notesEditor?.name ?? null },
    });
  });

  app.patch("/api/tournaments/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = tournamentUpdateSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const orgId = request.organizer!.orgId;

    // HI-5 — dates are immutable on the unsubscribed tiers. The UI explains
    // this and points at a support contact; an operator fulfils the change
    // with scripts/admin-entitlements.js set-dates.
    const changesDates = body.data.startDate !== undefined || body.data.endDate !== undefined;
    if (changesDates && !(await orgAllows(orgId, "tournament.editDates"))) {
      reply.code(402).send({ error: ENTITLEMENT_REQUIRED, reason: "dates_locked" });
      return;
    }
    if (changesDates) {
      const existing = await findOwnedTournament(params.data.id, orgId);
      if (!existing) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      const startDate = body.data.startDate ?? existing.startDate;
      const endDate = body.data.endDate ?? existing.endDate;
      if (!(await orgAllowsTournamentSpan(orgId, startDate, endDate))) {
        reply.code(402).send({
          error: ENTITLEMENT_REQUIRED,
          reason: "tournament_duration",
          maxDays: await orgMaxTournamentDays(orgId),
        });
        return;
      }
    }

    // PI-140 — stamp who last touched the notes, and when, but only when this
    // request actually changes them: an unrelated PATCH (a rename, a status
    // change) must not rewrite the attribution.
    const notesEdit =
      body.data.internalNotes !== undefined
        ? { internalNotesEditedAt: new Date(), internalNotesEditedById: request.organizer!.id }
        : {};

    const { count } = await prisma.tournament.updateMany({
      where: { id: params.data.id, orgId },
      data: { ...body.data, ...notesEdit },
    });
    if (count === 0) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    // A change to the default token rewards (PI-72) ripples to every pod that
    // inherits them — recompute each pod's auto awards.
    if (body.data.tokenParticipation !== undefined || body.data.tokenStandingBonuses !== undefined) {
      const pods = await prisma.pod.findMany({ where: { tournamentId: params.data.id }, select: { id: true } });
      for (const pod of pods) await syncPodTokenAwards(pod.id);
    }

    const tournament = await prisma.tournament.findUnique({ where: { id: params.data.id } });
    reply.send({ tournament });
  });

  // PI-76 — organizer reorder of the pod list. Rewrites every pod's
  // sequenceOrder to its index in the posted array, in one transaction, and
  // flips Tournament.podsManuallyReordered (PI-82: once used, the pod list
  // stops auto-sorting by scheduled date/time and sequenceOrder becomes the
  // sole ordering signal from here on).
  app.patch("/api/tournaments/:id/pod-order", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = podOrderSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const tournament = await findOwnedTournament(params.data.id, request.organizer!.orgId);
    if (!tournament) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    const existingPods = await prisma.pod.findMany({ where: { tournamentId: tournament.id }, select: { id: true } });
    const existingIds = new Set(existingPods.map((p) => p.id));
    const postedIds = new Set(body.data.podIds);
    if (existingIds.size !== postedIds.size || [...existingIds].some((id) => !postedIds.has(id))) {
      reply.code(400).send({ error: "pod_set_mismatch" });
      return;
    }

    await prisma.$transaction([
      ...body.data.podIds.map((podId, index) =>
        prisma.pod.update({ where: { id: podId }, data: { sequenceOrder: index } }),
      ),
      prisma.tournament.update({ where: { id: tournament.id }, data: { podsManuallyReordered: true } }),
    ]);

    reply.send({ ok: true });
  });

  app.delete("/api/tournaments/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const { count } = await prisma.tournament.deleteMany({
      where: { id: params.data.id, orgId: request.organizer!.orgId },
    });
    if (count === 0) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    reply.code(204).send();
  });

  app.post("/api/tournaments/:id/players", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = z.object({ playerId: z.string().min(1) }).safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const tournament = await findOwnedTournament(params.data.id, request.organizer!.orgId);
    if (!tournament) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    const player = await prisma.player.findFirst({
      where: { id: body.data.playerId, orgId: request.organizer!.orgId },
    });
    if (!player) {
      reply.code(404).send({ error: "player_not_found" });
      return;
    }

    const link = await prisma.tournamentPlayer.upsert({
      where: { tournamentId_playerId: { tournamentId: tournament.id, playerId: player.id } },
      create: { tournamentId: tournament.id, playerId: player.id },
      update: {},
    });
    reply.code(201).send({ tournamentPlayer: link });
  });

  app.delete("/api/tournaments/:id/players/:playerId", async (request, reply) => {
    const params = playerIdParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const tournament = await findOwnedTournament(params.data.id, request.organizer!.orgId);
    if (!tournament) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    await prisma.tournamentPlayer.deleteMany({
      where: { tournamentId: params.data.id, playerId: params.data.playerId },
    });
    reply.code(204).send();
  });

  // How many times each pair of attending players has already faced each
  // other across every pod this weekend — the "everyone plays everyone"
  // coverage view, and the same data the pairing engine's soft-avoid uses.
  app.get("/api/tournaments/:id/coverage", async (request, reply) => {
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

    const [tournamentPlayers, pairCounts] = await Promise.all([
      prisma.tournamentPlayer.findMany({
        where: { tournamentId: tournament.id },
        include: { player: true },
      }),
      computePlayerPairHistory(tournament.id),
    ]);

    const players = tournamentPlayers.map((tp) => ({ id: tp.player.id, displayName: tp.player.displayName }));
    const pairs = [...pairCounts.entries()].map(([key, count]) => {
      const [playerAId, playerBId] = key.split(":") as [string, string];
      return { playerAId, playerBId, count };
    });

    reply.send({ players, pairs });
  });

  // The weekend "overall" table — average points per pod played, ranked
  // (raw total shown alongside, but average is the ranking key).
  app.get("/api/tournaments/:id/gesamtwertung", async (request, reply) => {
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

    const { pods, rows } = await computeGesamtwertung(tournament.id);
    const players = await prisma.player.findMany({ where: { id: { in: rows.map((r) => r.playerId) } } });
    const playerById = new Map(players.map((p) => [p.id, p]));

    const gesamtwertung = rows.map((row) => ({ ...row, player: playerById.get(row.playerId) }));
    reply.send({ pods, gesamtwertung });
  });

  // Human-readable .xlsx export (PI-68): Tournament Standings + a sheet per
  // pod's standings + one flat Matches sheet. Distinct from the JSON org
  // export in Settings (that's the machine round-trip format).
  app.get("/api/tournaments/:id/export.xlsx", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    if (!(await orgAllows(request.organizer!.orgId, "export.excel"))) {
      reply.code(402).send({ error: ENTITLEMENT_REQUIRED, reason: "export.excel" });
      return;
    }
    const tournament = await findOwnedTournament(params.data.id, request.organizer!.orgId);
    if (!tournament) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const { buffer, filename } = await buildTournamentWorkbook(tournament.id);
    reply
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(buffer);
  });
}
