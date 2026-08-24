import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth/middleware.js";
import { computeHallOfFame } from "../services/hallOfFame.js";

export async function hallOfFameRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  // All-time player standings across every tournament in the org.
  app.get("/api/hall-of-fame", async (request, reply) => {
    const rows = await computeHallOfFame(request.organizer!.orgId);
    const players = await prisma.player.findMany({ where: { id: { in: rows.map((r) => r.playerId) } } });
    const playerById = new Map(players.map((p) => [p.id, p]));

    const hallOfFame = rows.map((row) => ({ ...row, player: playerById.get(row.playerId) }));
    reply.send({ hallOfFame });
  });
}
