import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth/middleware.js";
import { findOwnedTournament } from "../services/ownership.js";
import { computePlayerPairHistory } from "../services/weekendHistory.js";
import { computeGesamtwertung, countTournamentParticipants } from "../services/gesamtwertung.js";
import { buildTournamentWorkbook } from "../services/tournamentSpreadsheet.js";
import { zStandingBonuses, syncPodTokenAwards } from "../services/tokens.js";

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
    const tournament = await prisma.tournament.create({
      data: { ...parsed.data, orgId: request.organizer!.orgId },
    });
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
    const pods = tournament.pods.map(({ entrants: _entrants, ...pod }) => pod);
    reply.send({ tournament: { ...tournament, pods, playersPlayed } });
  });

  app.patch("/api/tournaments/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = tournamentUpdateSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const { count } = await prisma.tournament.updateMany({
      where: { id: params.data.id, orgId: request.organizer!.orgId },
      data: body.data,
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
