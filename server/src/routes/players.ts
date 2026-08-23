import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth/middleware.js";

const playerSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
});

const paramsSchema = z.object({ id: z.string().min(1) });

export async function playerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get("/api/players", async (request, reply) => {
    const players = await prisma.player.findMany({
      where: { orgId: request.organizer!.orgId },
      orderBy: { displayName: "asc" },
    });
    reply.send({ players });
  });

  app.post("/api/players", async (request, reply) => {
    const parsed = playerSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input", issues: parsed.error.issues });
      return;
    }

    const player = await prisma.player.create({
      data: { orgId: request.organizer!.orgId, displayName: parsed.data.displayName },
    });
    reply.code(201).send({ player });
  });

  app.patch("/api/players/:id", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = playerSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    // updateMany scoped by orgId (not a plain `update` by id) so a
    // request can never mutate another organization's player — that
    // check is the entire point, not an optimization.
    const { count } = await prisma.player.updateMany({
      where: { id: params.data.id, orgId: request.organizer!.orgId },
      data: { displayName: body.data.displayName },
    });

    if (count === 0) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    const player = await prisma.player.findUnique({ where: { id: params.data.id } });
    reply.send({ player });
  });

  app.delete("/api/players/:id", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }

    const { count } = await prisma.player.deleteMany({
      where: { id: params.data.id, orgId: request.organizer!.orgId },
    });

    if (count === 0) {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    reply.code(204).send();
  });
}
