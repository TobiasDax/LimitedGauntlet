import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
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

      const organization = await prisma.organization.findUniqueOrThrow({ where: { id: account.orgId } });

      request.session.set("organizerId", account.id);
      reply.send({
        organizer: { id: account.id, orgId: account.orgId, name: account.name, email: account.email },
        organization: { id: organization.id, slug: organization.slug, name: organization.name },
      });
    },
  );

  app.post("/api/auth/logout", async (request, reply) => {
    request.session.delete();
    reply.code(204).send();
  });

  app.get("/api/auth/me", { preHandler: requireAuth }, async (request, reply) => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: request.organizer!.orgId },
    });
    reply.send({
      organizer: request.organizer,
      organization: { id: organization.id, slug: organization.slug, name: organization.name },
    });
  });
}
