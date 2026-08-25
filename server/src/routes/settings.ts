import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { requireSessionAuth } from "../auth/middleware.js";
import { isEmailConfigured, sendMail, resolveBaseUrl } from "../services/mailer.js";

const publicLockSchema = z.object({ password: z.string().min(4).max(200) });
const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
const emailChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newEmail: z.string().trim().toLowerCase().email(),
});
const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1),
  confirmName: z.string().min(1),
});

function requestOrigin(request: FastifyRequest): string {
  const host = request.headers.host;
  return host ? `${request.protocol}://${host}` : "";
}

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

  // --- Account management (PI-28) ---

  // Change password — verify the current one, then set the new. Immediate.
  app.post(
    "/api/settings/password",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = passwordChangeSchema.safeParse(request.body);
      if (!body.success) {
        reply.code(400).send({ error: "invalid_input" });
        return;
      }
      const account = await prisma.organizerAccount.findUniqueOrThrow({ where: { id: request.organizer!.id } });
      if (!(await verifyPassword(account.passwordHash, body.data.currentPassword))) {
        reply.code(401).send({ error: "invalid_password" });
        return;
      }
      await prisma.organizerAccount.update({
        where: { id: account.id },
        data: { passwordHash: await hashPassword(body.data.newPassword) },
      });
      reply.send({ ok: true });
    },
  );

  // Start an email change — verify password, then send a confirmation link to
  // the NEW address. The switch only happens once that link is clicked (see the
  // public verify route in auth.ts). Requires SMTP to be configured.
  app.post(
    "/api/settings/email",
    { config: { rateLimit: { max: 3, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      if (!isEmailConfigured()) {
        reply.code(503).send({ error: "email_not_configured" });
        return;
      }
      const body = emailChangeSchema.safeParse(request.body);
      if (!body.success) {
        reply.code(400).send({ error: "invalid_input" });
        return;
      }
      const account = await prisma.organizerAccount.findUniqueOrThrow({ where: { id: request.organizer!.id } });
      if (!(await verifyPassword(account.passwordHash, body.data.currentPassword))) {
        reply.code(401).send({ error: "invalid_password" });
        return;
      }
      if (body.data.newEmail === account.email) {
        reply.code(400).send({ error: "same_email" });
        return;
      }
      const taken = await prisma.organizerAccount.findUnique({ where: { email: body.data.newEmail } });
      if (taken) {
        reply.code(409).send({ error: "email_taken" });
        return;
      }

      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await prisma.emailChangeRequest.create({
        data: {
          organizerId: account.id,
          newEmail: body.data.newEmail,
          tokenHash,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        },
      });

      const link = `${resolveBaseUrl(requestOrigin(request))}/verify-email?token=${token}`;
      await sendMail({
        to: body.data.newEmail,
        subject: "Confirm your new LimitedGauntlet email",
        text: `Confirm this address for your LimitedGauntlet account by opening:\n\n${link}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
      });
      reply.send({ ok: true });
    },
  );

  // Delete the account — since each org has one organizer today, this deletes
  // the whole organization and everything under it (cascade). Hard-gated:
  // re-enter password AND type the exact org name.
  app.post(
    "/api/settings/delete-account",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = deleteAccountSchema.safeParse(request.body);
      if (!body.success) {
        reply.code(400).send({ error: "invalid_input" });
        return;
      }
      const account = await prisma.organizerAccount.findUniqueOrThrow({ where: { id: request.organizer!.id } });
      if (!(await verifyPassword(account.passwordHash, body.data.currentPassword))) {
        reply.code(401).send({ error: "invalid_password" });
        return;
      }
      const org = await prisma.organization.findUniqueOrThrow({ where: { id: account.orgId } });
      if (body.data.confirmName.trim() !== org.name) {
        reply.code(400).send({ error: "name_mismatch" });
        return;
      }
      // Deleting the org cascades to organizers, players, tournaments, pods, …
      await prisma.organization.delete({ where: { id: org.id } });
      request.session.delete();
      reply.code(204).send();
    },
  );
}
