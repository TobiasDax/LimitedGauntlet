import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { requireAuth } from "../auth/middleware.js";
import { config, isLocalLoginDisabled, configuredSsoProviders, type SsoProviderId } from "../config.js";
import { beginSso, completeSso, isProviderConfigured, linkOrProvisionFromSso } from "../services/sso.js";
import { confirmOidcRelink } from "../services/oidcRelink.js";
import { fireAndForget, sendAdminWebhookEvent } from "../services/webhooks.js";
import { refreshRealtimeAuthorization } from "../realtime.js";

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

const oidcRelinkSchema = z.object({ token: z.string().min(1).max(200) });

function establishSession(request: { session: { set: (key: "organizerId" | "authVersion", value: string | number) => void } }, account: { id: string; authVersion?: number }) {
  request.session.set("organizerId", account.id);
  request.session.set("authVersion", account.authVersion ?? 0);
}

function requestOrigin(request: { protocol: string; headers: Record<string, unknown> }): string {
  const host = request.headers.host;
  return host ? `${request.protocol}://${String(host)}` : "";
}


function isUniqueConstraintError(err: unknown, target: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    Array.isArray(err.meta?.target) &&
    (err.meta.target as string[]).includes(target)
  );
}

// PI-75 — fired from both ways a brand-new org gets created (plain signup
// and the OIDC-bootstrapped flow below), never from accept-invite (that
// joins an existing org, which was already notified when it was created).
// No-op when ADMIN_WEBHOOK_URL isn't configured.
function notifyAdminOfNewOrg(organization: { name: string; slug: string }, creatorEmail: string): void {
  if (!config.adminWebhook) return;
  const webhook = config.adminWebhook;
  fireAndForget(() =>
    sendAdminWebhookEvent(webhook, { orgName: organization.name, orgSlug: organization.slug, creatorEmail }),
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
      // Configured SSO providers to render a button for (PI-42 / PI-43),
      // in display order — [] means password-only.
      ssoProviders: configuredSsoProviders(),
      // SSO-only mode: the frontend hides the local password form + signup link.
      localLoginDisabled: isLocalLoginDisabled(),
      // Deployer-configured web analytics (PI-85) — already validated by
      // trackingProviders.ts at startup. Only provider+code go over the
      // wire: scriptUrl (the real analytics host) stays server-side, since
      // routes/tracking.ts proxies it same-origin and the browser never
      // needs to know it.
      tracking: config.tracking ? { provider: config.tracking.provider, code: config.tracking.code } : null,
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

        establishSession(request, organizer);
        notifyAdminOfNewOrg(organization, organizer.email);
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

      establishSession(request, account);
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

  // Confirm a conflicting OIDC-subject relink. Public and token-gated; all
  // invalid, expired, replayed, or conflicting requests look identical.
  app.post(
    "/api/auth/oidc/relink",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = oidcRelinkSchema.safeParse(request.body);
      if (!body.success) {
        reply.code(400).send({ error: "invalid_or_expired" });
        return;
      }
      try {
        await confirmOidcRelink(body.data.token);
        refreshRealtimeAuthorization();
        request.log.info("OIDC subject relink confirmed");
        reply.send({ ok: true });
      } catch {
        reply.code(400).send({ error: "invalid_or_expired" });
      }
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

      establishSession(request, organizer);
      reply.code(201).send({
        organizer: { id: organizer.id, orgId: organizer.orgId, name: organizer.name, email: organizer.email },
        organization: { id: organization.id, slug: organization.slug, name: organization.name },
        publicLockEnabled: !!organization.publicPasswordHash,
        organizerCount,
      });
    },
  );

  // --- SSO login (PI-42 / PI-43) ---
  // A full-page redirect flow (not fetch/JSON): the browser is sent to the
  // provider and comes back to the callback, which sets the session and
  // redirects into the SPA. `/api/auth/sso/:provider/*` is the current shape;
  // `/api/auth/oidc/*` is kept as an alias so an already-registered generic-OIDC
  // redirect URI (e.g. Pocket ID) needs no change.

  const SSO_PROVIDERS = ["oidc", "google", "discord"] as const;
  function parseProvider(raw: unknown): SsoProviderId | null {
    return (SSO_PROVIDERS as readonly string[]).includes(raw as string) ? (raw as SsoProviderId) : null;
  }

  async function handleSsoLogin(request: FastifyRequest, reply: FastifyReply, provider: SsoProviderId) {
    if (!isProviderConfigured(provider)) {
      reply.code(404).send({ error: "sso_not_configured" });
      return;
    }
    const origin = requestOrigin(request);
    try {
      const start = await beginSso(provider, origin);
      request.session.set("sso", {
        provider,
        state: start.state,
        nonce: start.nonce,
        codeVerifier: start.codeVerifier,
        origin,
      });
      reply.redirect(start.url);
    } catch (err) {
      request.log.error({ err, provider }, "sso login start failed");
      reply.redirect("/login?error=oidc_unavailable");
    }
  }

  async function handleSsoCallback(request: FastifyRequest, reply: FastifyReply, provider: SsoProviderId) {
    if (!isProviderConfigured(provider)) {
      reply.code(404).send({ error: "sso_not_configured" });
      return;
    }
    // Read the current key; fall back to the pre-PI-43 `oidc` key so a login
    // started just before a deploy still completes.
    const sso = request.session.get("sso");
    const legacy = request.session.get("oidc");
    request.session.set("sso", undefined);
    request.session.set("oidc", undefined);
    const checks = sso ?? (legacy ? { provider: "oidc" as const, ...legacy } : null);
    if (!checks || checks.provider !== provider) {
      reply.redirect("/login?error=oidc_expired");
      return;
    }
    try {
      const identity = await completeSso(provider, checks.origin, request.query as Record<string, string>, {
        state: checks.state,
        nonce: checks.nonce,
        codeVerifier: checks.codeVerifier,
      });
      const result = await linkOrProvisionFromSso(provider, identity, checks.origin);
      if (result.status === "error") {
        reply.redirect(`/login?error=${result.error}`);
        return;
      }
      if (result.status === "needs_registration") {
        // Verified identity, no account yet, signups open — stash it and send
        // them to the org-setup screen to finish creating their org. `subject`
        // is already provider-prefixed.
        request.session.set("oidcPending", { subject: result.subject, email: result.email, name: result.name });
        reply.redirect("/oidc-setup");
        return;
      }
      if (result.status === "recovery_required") {
        reply.redirect(`/login?error=${result.emailSent ? "oidc_recovery_required" : "oidc_recovery_required_no_email"}`);
        return;
      }
      establishSession(request, { id: result.organizerId, authVersion: result.authVersion });
      reply.redirect("/");
    } catch (err) {
      request.log.error({ err, provider }, "sso callback failed");
      reply.redirect("/login?error=oidc_failed");
    }
  }

  const ssoRateLimit = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };

  app.get("/api/auth/sso/:provider/login", ssoRateLimit, async (request, reply) => {
    const provider = parseProvider((request.params as { provider?: string }).provider);
    if (!provider) {
      reply.code(404).send({ error: "sso_not_configured" });
      return;
    }
    await handleSsoLogin(request, reply, provider);
  });

  app.get("/api/auth/sso/:provider/callback", ssoRateLimit, async (request, reply) => {
    const provider = parseProvider((request.params as { provider?: string }).provider);
    if (!provider) {
      reply.code(404).send({ error: "sso_not_configured" });
      return;
    }
    await handleSsoCallback(request, reply, provider);
  });

  // Back-compat aliases for the generic OIDC provider.
  app.get("/api/auth/oidc/login", ssoRateLimit, (request, reply) => handleSsoLogin(request, reply, "oidc"));
  app.get("/api/auth/oidc/callback", ssoRateLimit, (request, reply) => handleSsoCallback(request, reply, "oidc"));

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
        establishSession(request, organizer);
        notifyAdminOfNewOrg(organization, organizer.email);
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
      tokensEnabled: organization.tokensEnabled,
      organizerCount,
    });
  });
}
