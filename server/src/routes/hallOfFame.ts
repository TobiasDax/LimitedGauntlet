import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth/middleware.js";
import { computeHallOfFameOverview, computePlayerStats } from "../services/playerStats.js";

const idParams = z.object({ id: z.string().min(1) });

export async function hallOfFameRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  // All-time player standings across every tournament in the org, plus
  // headline stats, most-played pairings, and the biggest pulls — the
  // overview page's full data in one call.
  app.get("/api/hall-of-fame", async (request, reply) => {
    const overview = await computeHallOfFameOverview(request.organizer!.orgId);
    const players = await prisma.player.findMany({
      where: { id: { in: overview.rankings.map((r) => r.playerId) } },
    });
    const playerById = new Map(players.map((p) => [p.id, p]));

    const hallOfFame = overview.rankings.map((row) => ({ ...row, player: playerById.get(row.playerId) }));
    reply.send({
      hallOfFame,
      headline: overview.headline,
      longestWinStreak: overview.longestWinStreak,
      mostPlayedPairings: overview.mostPlayedPairings,
      biggestPulls: overview.biggestPulls,
    });
  });

  // Per-player deep dive: record, head-to-head, nemesis/victim, finishes.
  app.get("/api/hall-of-fame/players/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const stats = await computePlayerStats(request.organizer!.orgId, params.data.id);
    if (!stats) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    reply.send({ stats });
  });
}
