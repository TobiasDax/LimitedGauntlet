import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { requireAuth } from "../auth/middleware.js";
import { config, isOidcConfigured, isLocalLoginDisabled } from "../config.js";
import { beginOidcLogin, completeOidcLogin, type OidcIdentity } from "../services/oidc.js";

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

// Finishing an OIDC-bootstrapped registration (PI-42): the email/subject come
// from the verified session, so the client only supplies the org details + the
// organizer's display name.
const completeOidcRegistrationSchema = z.object({
  orgName: z.string().trim().min(1).max(100),
  orgSlug: z.string().trim().min(3).max(40).regex(slugPattern, "lowercase letters, numbers, and hyphens only"),
  organizerName: z.string().trim().min(1).max(100),
});

function requestOrigin(request: { protocol: string; headers: Record<string, unknown> }): string {
  const host = request.headers.host;
  return host ? `${request.protocol}://${String(host)}` : "";
}

// OIDC login resolution (PI-42): map a verified external identity to an
// organizer account. The paths, in order:
//   1. Known subject → the account we linked before.
//   2. Verified email matching an existing account → link (record the subject).
//   3. Verified email matching a pending co-organizer invite → provision a
//      passwordless account into that org and consume the invite (SSO as an
//      alternative to the password-set accept-invite flow).
//   4. Unknown identity + signups open → "needs_registration": the caller sends
//      them to the org-setup screen to create a brand-new org via SSO.
//   5. Unknown identity + signups closed → refused; an organizer must invite
//      this email first.
type LinkResult =
  | { status: "ok"; organizerId: string }
  | { status: "needs_registration"; identity: OidcIdentity }
  | { status: "error"; error: string };

async function linkOrProvisionFromOidc(identity: OidcIdentity): Promise<LinkResult> {
  const bySubject = await prisma.organizerAccount.findUnique({ where: { oidcSubject: identity.subject } });
  if (bySubject) return { status: "ok", organizerId: bySubject.id };

  if (!identity.email || !identity.emailVerified) {
    return { status: "error", error: "oidc_email_unverified" };
  }

  const byEmail = await prisma.organizerAccount.findUnique({ where: { email: identity.email } });
  if (byEmail) {
    // Link the subject to the existing account if it isn't already, so future
    // logins match on the stable subject even if the IdP email changes.
    if (!byEmail.oidcSubject) {
      await prisma.organizerAccount.update({ where: { id: byEmail.id }, data: { oidcSubject: identity.subject } });
    }
    return { status: "ok", organizerId: byEmail.id };
  }

  const invite = await prisma.organizerInvite.findFirst({
    where: { email: identity.email, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (invite) {
    const [organizer] = await prisma.$transaction([
      prisma.organizerAccount.create({
        data: {
          orgId: invite.orgId,
          email: identity.email,
          name: identity.name || identity.email,
          passwordHash: null,
          oidcSubject: identity.subject,
        },
      }),
      prisma.organizerInvite.update({ where: { id: invite.id }, data: { usedAt: new Date() } }),
    ]);
    return { status: "ok", organizerId: organizer.id };
  }

  // No existing account and no invite. When signups are open, let them bootstrap
  // a new org via the setup screen; otherwise hold the line on closed signup.
  if (config.allowSignup) {
    return { status: "needs_registration", identity };
  }
  return { status: "error", error: "oidc_no_account" };
}

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

  // Public app-wide config the frontend chrome needs before/without a
  // session — currently just the optional footer legal link (PI-35).
  app.get("/api/app-config", async (_request, reply) => {
    reply.send({
      legalLinkUrl: config.legalLinkUrl || null,
      legalLinkLabel: config.legalLinkLabel || null,
      // Whether SSO login is available + the button label (PI-42).
      oidcEnabled: isOidcConfigured(),
      oidcProviderName: config.oidc.providerName,
      // SSO-only mode: the frontend hides the local password form + signup link.
      localLoginDisabled: isLocalLoginDisabled(),
    });
  });

  app.post(
    "/api/auth/signup",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      // In SSO-only mode there are no local password accounts to create —
      // registration goes through the OIDC org-setup flow instead.
      if (isLocalLoginDisabled()) {
        reply.code(403).send({ error: "local_login_disabled" });
        return;
      }
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
      if (isLocalLoginDisabled()) {
        reply.code(403).send({ error: "local_login_disabled" });
        return;
      }
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid_input", issues: parsed.error.issues });
        return;
      }
      const { email, password } = parsed.data;

      const account = await prisma.organizerAccount.findUnique({ where: { email } });
      // An OIDC-only account (PI-42) has no local password — password login
      // can't succeed for it. Kept generic (not a distinct error) to avoid
      // revealing which emails have accounts.
      const valid = account?.passwordHash ? await verifyPassword(account.passwordHash, password) : false;

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

  // --- OIDC / SSO login (PI-42) ---
  // A full-page redirect flow (not fetch/JSON): the browser is sent to the IdP
  // and comes back to the callback below, which sets the session and redirects
  // into the SPA. Both routes 404/redirect cleanly when OIDC isn't configured.

  app.get(
    "/api/auth/oidc/login",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (!isOidcConfigured()) {
        reply.code(404).send({ error: "oidc_not_configured" });
        return;
      }
      const origin = requestOrigin(request);
      try {
        const start = await beginOidcLogin(origin);
        request.session.set("oidc", {
          state: start.state,
          nonce: start.nonce,
          codeVerifier: start.codeVerifier,
          origin,
        });
        reply.redirect(start.url);
      } catch (err) {
        request.log.error({ err }, "oidc login start failed");
        reply.redirect("/login?error=oidc_unavailable");
      }
    },
  );

  app.get(
    "/api/auth/oidc/callback",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (!isOidcConfigured()) {
        reply.code(404).send({ error: "oidc_not_configured" });
        return;
      }
      const checks = request.session.get("oidc");
      request.session.set("oidc", undefined); // single-use, whatever happens next
      if (!checks) {
        reply.redirect("/login?error=oidc_expired");
        return;
      }
      try {
        const identity = await completeOidcLogin(checks.origin, request.query as Record<string, string>, {
          state: checks.state,
          nonce: checks.nonce,
          codeVerifier: checks.codeVerifier,
        });
        const result = await linkOrProvisionFromOidc(identity);
        if (result.status === "error") {
          reply.redirect(`/login?error=${result.error}`);
          return;
        }
        if (result.status === "needs_registration") {
          // Verified identity, no account yet, signups open — stash it and send
          // them to the org-setup screen to finish creating their org.
          request.session.set("oidcPending", {
            subject: result.identity.subject,
            email: result.identity.email!,
            name: result.identity.name ?? "",
          });
          reply.redirect("/oidc-setup");
          return;
        }
        request.session.set("organizerId", result.organizerId);
        reply.redirect("/");
      } catch (err) {
        request.log.error({ err }, "oidc callback failed");
        reply.redirect("/login?error=oidc_failed");
      }
    },
  );

  // The pending OIDC registration for the current session, so the org-setup
  // screen can prefill/gate itself. 404 when there's nothing pending (the page
  // then bounces to /login).
  app.get("/api/auth/oidc/pending", async (request, reply) => {
    const pending = request.session.get("oidcPending");
    if (!pending) {
      reply.code(404).send({ error: "no_pending_registration" });
      return;
    }
    reply.send({ email: pending.email, suggestedName: pending.name });
  });

  // Finish an OIDC-bootstrapped registration: create the org + a passwordless
  // organizer from the verified pending identity, then log them in. The email
  // and OIDC subject are taken from the session (verified in the callback), not
  // from the request body.
  app.post(
    "/api/auth/oidc/complete-registration",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const pending = request.session.get("oidcPending");
      if (!pending) {
        reply.code(400).send({ error: "no_pending_registration" });
        return;
      }
      const parsed = completeOidcRegistrationSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid_input", issues: parsed.error.issues });
        return;
      }
      const { orgName, orgSlug, organizerName } = parsed.data;

      try {
        const { organization, organizer } = await prisma.$transaction(async (tx) => {
          const organization = await tx.organization.create({ data: { name: orgName, slug: orgSlug } });
          const organizer = await tx.organizerAccount.create({
            data: {
              orgId: organization.id,
              name: organizerName,
              email: pending.email,
              passwordHash: null,
              oidcSubject: pending.subject,
            },
          });
          return { organization, organizer };
        });

        request.session.set("oidcPending", undefined);
        request.session.set("organizerId", organizer.id);
        reply.code(201).send({
          organizer: { id: organizer.id, orgId: organizer.orgId, name: organizer.name, email: organizer.email },
          organization: { id: organization.id, slug: organization.slug, name: organization.name },
          publicLockEnabled: false,
          organizerCount: 1,
        });
      } catch (err) {
        if (isUniqueConstraintError(err, "slug")) {
          reply.code(409).send({ error: "slug_taken" });
          return;
        }
        // The email/subject were free when the callback checked, but a race (or
        // a second concurrent setup) could collide — surface it rather than 500.
        if (isUniqueConstraintError(err, "email") || isUniqueConstraintError(err, "oidcSubject")) {
          reply.code(409).send({ error: "account_exists" });
          return;
        }
        throw err;
      }
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
