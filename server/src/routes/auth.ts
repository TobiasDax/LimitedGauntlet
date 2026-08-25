import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { requireAuth } from "../auth/middleware.js";
import { config } from "../config.js";

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const signupSchema = z.object({
  orgName: z.string().trim().min(1).max(100),
  orgSlug: z.string().trim().min(3).max(40).regex(slugPattern, "lowercase letters, numbers, and hyphens only"),
  organizerName: z.string().trim().min(1).max(100),
  organizerEmail: z.string().trim().toLowerCase().email(),
  organizerPassword: z.string().min(8).max(200),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(200),
});

function isUniqueConstraintError(err: unknown, target: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    Array.isArray(err.meta?.target) &&
    (err.meta.target as string[]).includes(target)
  );
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Public (no auth needed — someone deciding whether to even show the
  // signup form can't be logged in yet) so the frontend can show a clear
  // "signups are closed" message instead of a dead-end form.
  app.get("/api/auth/signup-status", async (_request, reply) => {
    reply.send({ allowSignup: config.allowSignup });
  });

  app.post(
    "/api/auth/signup",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      if (!config.allowSignup) {
        reply.code(403).send({ error: "signup_disabled" });
        return;
      }

      const parsed = signupSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid_input", issues: parsed.error.issues });
        return;
      }
      const { orgName, orgSlug, organizerName, organizerEmail, organizerPassword } = parsed.data;

      const passwordHash = await hashPassword(organizerPassword);

      try {
        const { organization, organizer } = await prisma.$transaction(async (tx) => {
          const organization = await tx.organization.create({
            data: { name: orgName, slug: orgSlug },
          });
          const organizer = await tx.organizerAccount.create({
            data: {
              orgId: organization.id,
              name: organizerName,
              email: organizerEmail,
              passwordHash,
            },
          });
          return { organization, organizer };
        });

        request.session.set("organizerId", organizer.id);
        reply.code(201).send({
          organization: { id: organization.id, slug: organization.slug, name: organization.name },
          organizer: { id: organizer.id, name: organizer.name, email: organizer.email },
          publicLockEnabled: false,
          organizerCount: 1, // a brand-new org can't have co-organizers yet
        });
      } catch (err) {
        if (isUniqueConstraintError(err, "slug")) {
          reply.code(409).send({ error: "slug_taken" });
          return;
        }
        if (isUniqueConstraintError(err, "email")) {
          reply.code(409).send({ error: "email_taken" });
          return;
        }
        throw err;
      }
    },
  );

  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid_input", issues: parsed.error.issues });
        return;
      }
      const { email, password } = parsed.data;

      const account = await prisma.organizerAccount.findUnique({ where: { email } });
      const valid = account ? await verifyPassword(account.passwordHash, password) : false;

      if (!account || !valid) {
        reply.code(401).send({ error: "invalid_credentials" });
        return;
      }

      const [organization, organizerCount] = await Promise.all([
        prisma.organization.findUniqueOrThrow({ where: { id: account.orgId } }),
        prisma.organizerAccount.count({ where: { orgId: account.orgId } }),
      ]);

      request.session.set("organizerId", account.id);
      reply.send({
        organizer: { id: account.id, orgId: account.orgId, name: account.name, email: account.email },
        organization: { id: organization.id, slug: organization.slug, name: organization.name },
        publicLockEnabled: !!organization.publicPasswordHash,
        organizerCount,
      });
    },
  );

  app.post("/api/auth/logout", async (request, reply) => {
    request.session.delete();
    reply.code(204).send();
  });

  // Confirm a pending email change (PI-28). Public + token-gated: the token was
  // emailed to the NEW address, so possessing it proves control of that inbox
  // (the change was already password-authorized when requested). Single-use and
  // time-limited; email uniqueness is re-checked at apply time.
  app.post(
    "/api/auth/verify-email-change",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = z.object({ token: z.string().min(1) }).safeParse(request.body);
      if (!body.success) {
        reply.code(400).send({ error: "invalid_input" });
        return;
      }
      const tokenHash = createHash("sha256").update(body.data.token).digest("hex");
      const change = await prisma.emailChangeRequest.findUnique({ where: { tokenHash } });
      if (!change || change.usedAt || change.expiresAt < new Date()) {
        reply.code(400).send({ error: "invalid_or_expired" });
        return;
      }
      const taken = await prisma.organizerAccount.findFirst({
        where: { email: change.newEmail, id: { not: change.organizerId } },
      });
      if (taken) {
        reply.code(409).send({ error: "email_taken" });
        return;
      }
      await prisma.$transaction([
        prisma.organizerAccount.update({ where: { id: change.organizerId }, data: { email: change.newEmail } }),
        prisma.emailChangeRequest.update({ where: { id: change.id }, data: { usedAt: new Date() } }),
      ]);
      reply.send({ ok: true, email: change.newEmail });
    },
  );

  // Look up a pending co-organizer invite by its token (PI-34) — public, so
  // the accept-invite page can show "you're invited to join X" before the
  // invitee has any account to authenticate with.
  app.get("/api/auth/invite/:token", async (request, reply) => {
    const params = z.object({ token: z.string().min(1) }).safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const tokenHash = createHash("sha256").update(params.data.token).digest("hex");
    const invite = await prisma.organizerInvite.findUnique({
      where: { tokenHash },
      include: { organization: { select: { name: true } } },
    });
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      reply.code(404).send({ error: "invalid_or_expired" });
      return;
    }
    reply.send({ email: invite.email, organizationName: invite.organization.name });
  });

  // Accept a co-organizer invite: the invitee sets their own name + password
  // and a new OrganizerAccount is created in the inviting org. Roles are
  // equal for v1 — this is a full organizer, same access as anyone else.
  app.post(
    "/api/auth/accept-invite",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const body = acceptInviteSchema.safeParse(request.body);
      if (!body.success) {
        reply.code(400).send({ error: "invalid_input", issues: body.error.issues });
        return;
      }
      const tokenHash = createHash("sha256").update(body.data.token).digest("hex");
      const invite = await prisma.organizerInvite.findUnique({ where: { tokenHash } });
      if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
        reply.code(400).send({ error: "invalid_or_expired" });
        return;
      }
      const taken = await prisma.organizerAccount.findUnique({ where: { email: invite.email } });
      if (taken) {
        reply.code(409).send({ error: "email_taken" });
        return;
      }

      const passwordHash = await hashPassword(body.data.password);
      const [organizer] = await prisma.$transaction([
        prisma.organizerAccount.create({
          data: { orgId: invite.orgId, email: invite.email, name: body.data.name, passwordHash },
        }),
        prisma.organizerInvite.update({ where: { id: invite.id }, data: { usedAt: new Date() } }),
      ]);

      const [organization, organizerCount] = await Promise.all([
        prisma.organization.findUniqueOrThrow({ where: { id: invite.orgId } }),
        prisma.organizerAccount.count({ where: { orgId: invite.orgId } }),
      ]);

      request.session.set("organizerId", organizer.id);
      reply.code(201).send({
        organizer: { id: organizer.id, orgId: organizer.orgId, name: organizer.name, email: organizer.email },
        organization: { id: organization.id, slug: organization.slug, name: organization.name },
        publicLockEnabled: !!organization.publicPasswordHash,
        organizerCount,
      });
    },
  );

  app.get("/api/auth/me", { preHandler: requireAuth }, async (request, reply) => {
    const [organization, organizerCount] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id: request.organizer!.orgId } }),
      prisma.organizerAccount.count({ where: { orgId: request.organizer!.orgId } }),
    ]);
    reply.send({
      organizer: request.organizer,
      organization: { id: organization.id, slug: organization.slug, name: organization.name },
      publicLockEnabled: !!organization.publicPasswordHash,
      organizerCount,
    });
  });
}
