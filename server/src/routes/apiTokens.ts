import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireSessionAuth } from "../auth/middleware.js";
import { generateApiToken } from "../auth/apiToken.js";

const idParams = z.object({ id: z.string().min(1) });
const createSchema = z.object({ name: z.string().trim().min(1).max(100) });

function toPublic(t: { id: string; name: string; createdAt: Date; lastUsedAt: Date | null }) {
  return { id: t.id, name: t.name, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt };
}

// Mint/list/revoke bearer tokens for the logged-in organizer — deliberately
// session-only (not itself bearer-accessible), so a leaked API token can
// never be used to mint more tokens for itself.
export async function apiTokenRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireSessionAuth);

  app.get("/api/api-tokens", async (request, reply) => {
    const tokens = await prisma.apiToken.findMany({
      where: { organizerId: request.organizer!.id },
      orderBy: { createdAt: "desc" },
    });
    reply.send({ apiTokens: tokens.map(toPublic) });
  });

  // The plaintext token is returned exactly once, here, and never again —
  // only its hash is ever stored.
  app.post("/api/api-tokens", async (request, reply) => {
    const body = createSchema.safeParse(request.body);
    if (!body.success) {
      reply.code(400).send({ error: "invalid_input", issues: body.error.issues });
      return;
    }

    const { plaintext, hash } = generateApiToken();
    const apiToken = await prisma.apiToken.create({
      data: { organizerId: request.organizer!.id, name: body.data.name, tokenHash: hash },
    });
    reply.code(201).send({ token: plaintext, apiToken: toPublic(apiToken) });
  });

  app.delete("/api/api-tokens/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const { count } = await prisma.apiToken.deleteMany({
      where: { id: params.data.id, organizerId: request.organizer!.id },
    });
    if (count === 0) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    reply.code(204).send();
  });
}
