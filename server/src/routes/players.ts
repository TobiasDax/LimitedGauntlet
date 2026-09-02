import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth/middleware.js";

const playerSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
});

const paramsSchema = z.object({ id: z.string().min(1) });

// Never send the login credentials (PI-52) back to the client — the roster
// only cares whether an account exists, exposed as `hasAccount` on the list.
function publicPlayer<T extends { passwordHash: string | null; email: string | null }>(player: T) {
  const { passwordHash, email, ...rest } = player;
  return { ...rest, hasAccount: passwordHash !== null };
}

export async function playerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get("/api/players", async (request, reply) => {
    const rows = await prisma.player.findMany({
      where: { orgId: request.organizer!.orgId },
      orderBy: { displayName: "asc" },
      include: {
        _count: { select: { playerInvites: { where: { usedAt: null, expiresAt: { gt: new Date() } } } } },
      },
    });
    // Never leak the hash or the login email over the wire — the roster UI
    // only needs to know whether an account / pending invite exists (PI-52).
    const players = rows.map(({ _count, ...p }) => ({
      ...publicPlayer(p),
      pendingInvite: _count.playerInvites > 0,
    }));
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
    reply.code(201).send({ player: publicPlayer(player) });
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

    const player = await prisma.player.findUniqueOrThrow({ where: { id: params.data.id } });
    reply.send({ player: publicPlayer(player) });
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
