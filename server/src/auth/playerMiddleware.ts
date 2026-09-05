import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../prisma.js";

// Attaches request.player for the self-service player portal (PI-52, split in
// PI-86). Session cookie only. The session carries the shared PlayerIdentity
// (playerIdentityId + playerAuthVersion) plus which org's portal it's in
// (playerOrgId). Valid only when: the identity exists with a matching
// authVersion AND it's still linked to a Player row in that org (an
// organizer revoke unlinks the Player, dropping the session for that org
// without touching the player's sessions for other orgs).
export async function requirePlayerAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const identityId = request.session.get("playerIdentityId");
  const orgId = request.session.get("playerOrgId");
  if (!identityId || !orgId) {
    reply.code(401).send({ error: "unauthenticated" });
    return;
  }

  const [identity, player] = await Promise.all([
    prisma.playerIdentity.findUnique({ where: { id: identityId }, select: { authVersion: true } }),
    prisma.player.findFirst({ where: { identityId, orgId }, select: { id: true, orgId: true, displayName: true } }),
  ]);
  const sessionVersion = request.session.get("playerAuthVersion");
  if (!identity || !player || (sessionVersion ?? 0) !== identity.authVersion) {
    request.session.set("playerIdentityId", undefined);
    request.session.set("playerAuthVersion", undefined);
    request.session.set("playerOrgId", undefined);
    reply.code(401).send({ error: "unauthenticated" });
    return;
  }

  request.player = { id: player.id, identityId, orgId: player.orgId, displayName: player.displayName };
}
