import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../prisma.js";

// Attaches request.player for the self-service player portal (PI-52). Session
// cookie only — players never get bearer/API tokens. Mirrors requireAuth
// (auth/middleware.ts): the session's playerAuthVersion must still match the
// Player row, so a revoked account (authVersion bumped) drops its live session
// on the next request. Independent of the organizer session — an organizer
// cookie without a playerId is simply not a player here.
export async function requirePlayerAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const playerId = request.session.get("playerId");
  if (!playerId) {
    reply.code(401).send({ error: "unauthenticated" });
    return;
  }

  const player = await prisma.player.findUnique({ where: { id: playerId } });
  const sessionVersion = request.session.get("playerAuthVersion");
  if (!player || !player.passwordHash || (sessionVersion ?? 0) !== player.authVersion) {
    request.session.set("playerId", undefined);
    request.session.set("playerAuthVersion", undefined);
    reply.code(401).send({ error: "unauthenticated" });
    return;
  }

  request.player = { id: player.id, orgId: player.orgId, displayName: player.displayName };
}
