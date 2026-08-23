import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../prisma.js";

// Attaches request.organizer, scoped to their own org, for any route that
// needs it. Every org-scoped query downstream must filter by
// request.organizer.orgId — that's the entire multi-tenancy boundary.
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const organizerId = request.session.get("organizerId");
  if (!organizerId) {
    reply.code(401).send({ error: "unauthenticated" });
    return;
  }

  const account = await prisma.organizerAccount.findUnique({
    where: { id: organizerId },
  });

  if (!account) {
    request.session.delete();
    reply.code(401).send({ error: "unauthenticated" });
    return;
  }

  request.organizer = {
    id: account.id,
    orgId: account.orgId,
    email: account.email,
    name: account.name,
  };
}
