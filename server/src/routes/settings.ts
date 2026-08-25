import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { hashPassword } from "../auth/password.js";
import { requireSessionAuth } from "../auth/middleware.js";

const publicLockSchema = z.object({ password: z.string().min(4).max(200) });

// Organizer settings that aren't specific to another resource. Session-auth
// only (never bearer tokens) — same posture as the API-token routes: a leaked
// API token must not be able to change account/org security settings.
export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireSessionAuth);

  // Enable / change the org-wide public-page password lock (PI-27).
  app.put("/api/settings/public-lock", async (request, reply) => {
    const body = publicLockSchema.safeParse(request.body);
    if (!body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const publicPasswordHash = await hashPassword(body.data.password);
    await prisma.organization.update({
      where: { id: request.organizer!.orgId },
      data: { publicPasswordHash },
    });
    reply.send({ publicLockEnabled: true });
  });

  // Disable the lock (public pages open again).
  app.delete("/api/settings/public-lock", async (request, reply) => {
    await prisma.organization.update({
      where: { id: request.organizer!.orgId },
      data: { publicPasswordHash: null },
    });
    reply.send({ publicLockEnabled: false });
  });
}
