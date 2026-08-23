import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth/middleware.js";

const tournamentCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  location: z.string().trim().max(200).optional(),
});

const tournamentUpdateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  location: z.string().trim().max(200).optional(),
  status: z.enum(["PLANNING", "ACTIVE", "COMPLETED"]).optional(),
});

const idParams = z.object({ id: z.string().min(1) });
const playerIdParams = z.object({ id: z.string().min(1), playerId: z.string().min(1) });

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
        pods: { orderBy: { sequenceOrder: "asc" } },
        players: { include: { player: true } },
      },
    });
    if (!tournament) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    reply.send({ tournament });
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

    const tournament = await prisma.tournament.findUnique({ where: { id: params.data.id } });
    reply.send({ tournament });
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

    const tournament = await prisma.tournament.findFirst({
      where: { id: params.data.id, orgId: request.organizer!.orgId },
    });
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

    const tournament = await prisma.tournament.findFirst({
      where: { id: params.data.id, orgId: request.organizer!.orgId },
    });
    if (!tournament) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    await prisma.tournamentPlayer.deleteMany({
      where: { tournamentId: params.data.id, playerId: params.data.playerId },
    });
    reply.code(204).send();
  });
}
