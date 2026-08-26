import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { requireSessionAuth } from "../auth/middleware.js";
import { isEmailConfigured, sendMail, resolveBaseUrl } from "../services/mailer.js";
import { buildOrgExport, type ExportSections } from "../services/orgExport.js";
import { ImportInProgressError, parseOrgExport, importOrgData } from "../services/orgImport.js";
import { generateWebhookSecret, sendTestWebhookEvent } from "../services/webhooks.js";
import { refreshRealtimeAuthorization } from "../realtime.js";

const publicLockSchema = z.object({ password: z.string().min(4).max(200) });
const passwordChangeSchema = z.object({
  // Optional so an OIDC-only account (no local password, PI-42) can set its
  // first password. When the account already has a password, it's required and
  // verified below.
  currentPassword: z.string().optional(),
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
const deleteOrganizationSchema = z.object({
  currentPassword: z.string().min(1),
  confirmName: z.string().min(1),
});
const inviteOrganizerSchema = z.object({ email: z.string().trim().toLowerCase().email() });
const webhookUrlSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .refine((url) => url.startsWith("http://") || url.startsWith("https://"), "must be an http(s) URL")
    .nullable(),
});
const idParams = z.object({ id: z.string().min(1) });

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — invites sit in inboxes longer than the 1hr email-change link

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
    refreshRealtimeAuthorization();
    reply.send({ publicLockEnabled: true });
  });

  // Disable the lock (public pages open again).
  app.delete("/api/settings/public-lock", async (request, reply) => {
    await prisma.organization.update({
      where: { id: request.organizer!.orgId },
      data: { publicPasswordHash: null },
    });
    refreshRealtimeAuthorization();
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
      // If the account already has a password, the current one is required and
      // must verify. An OIDC-only account (passwordHash null) is setting its
      // first password, so there's nothing to verify.
      if (account.passwordHash) {
        if (!body.data.currentPassword || !(await verifyPassword(account.passwordHash, body.data.currentPassword))) {
          reply.code(401).send({ error: "invalid_password" });
          return;
        }
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
      // An OIDC-only account (PI-42) has no password to re-verify — it must set
      // one first (Settings → Account) before these password-gated actions.
      if (!account.passwordHash) {
        reply.code(400).send({ error: "password_required" });
        return;
      }
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

  // Delete the account (PI-34: revised for multi-organizer orgs). If this is
  // the org's only organizer, behavior is unchanged from PI-28 — deletes the
  // whole organization and everything under it (cascade), confirmed by typing
  // the org name. If co-organizers remain, this instead just removes THIS
  // organizer's own access ("leave") — the org and its data are untouched, so
  // the confirmation is the organizer's own email, not the org name (typing
  // the org name to merely remove yourself would be a confusing mismatch
  // between the stated confirmation and what actually happens).
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
      // An OIDC-only account (PI-42) has no password to re-verify — it must set
      // one first (Settings → Account) before these password-gated actions.
      if (!account.passwordHash) {
        reply.code(400).send({ error: "password_required" });
        return;
      }
      if (!(await verifyPassword(account.passwordHash, body.data.currentPassword))) {
        reply.code(401).send({ error: "invalid_password" });
        return;
      }
      const organizerCount = await prisma.organizerAccount.count({ where: { orgId: account.orgId } });
      const confirmName = body.data.confirmName.trim();

      if (organizerCount > 1) {
        if (confirmName !== account.email) {
          reply.code(400).send({ error: "name_mismatch" });
          return;
        }
        await prisma.organizerAccount.delete({ where: { id: account.id } });
      } else {
        const org = await prisma.organization.findUniqueOrThrow({ where: { id: account.orgId } });
        if (confirmName !== org.name) {
          reply.code(400).send({ error: "name_mismatch" });
          return;
        }
        // Deleting the org cascades to organizers, players, tournaments, pods, …
        await prisma.organization.delete({ where: { id: org.id } });
      }
      request.session.delete();
      reply.code(204).send();
    },
  );

  // Explicit "delete organization" (PI-34) — distinct from "delete my account"
  // above: always deletes the whole org and everything in it, regardless of
  // how many organizers remain. Any organizer can do this (roles are equal
  // for v1). Hard-gated the same way: password + type the exact org name.
  app.post(
    "/api/settings/delete-organization",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = deleteOrganizationSchema.safeParse(request.body);
      if (!body.success) {
        reply.code(400).send({ error: "invalid_input" });
        return;
      }
      const account = await prisma.organizerAccount.findUniqueOrThrow({ where: { id: request.organizer!.id } });
      // An OIDC-only account (PI-42) has no password to re-verify — it must set
      // one first (Settings → Account) before these password-gated actions.
      if (!account.passwordHash) {
        reply.code(400).send({ error: "password_required" });
        return;
      }
      if (!(await verifyPassword(account.passwordHash, body.data.currentPassword))) {
        reply.code(401).send({ error: "invalid_password" });
        return;
      }
      const org = await prisma.organization.findUniqueOrThrow({ where: { id: account.orgId } });
      if (body.data.confirmName.trim() !== org.name) {
        reply.code(400).send({ error: "name_mismatch" });
        return;
      }
      await prisma.organization.delete({ where: { id: org.id } });
      request.session.delete();
      reply.code(204).send();
    },
  );

  // --- Co-organizers (PI-34) ---
  // Roles are equal for v1: an invite, once accepted, creates a full
  // OrganizerAccount with the same access as anyone else in the org.

  app.get("/api/settings/organizers", async (request, reply) => {
    const orgId = request.organizer!.orgId;
    const [organizers, invites] = await Promise.all([
      prisma.organizerAccount.findMany({
        where: { orgId },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, email: true, createdAt: true },
      }),
      prisma.organizerInvite.findMany({
        where: { orgId, usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        include: { invitedBy: { select: { name: true } } },
      }),
    ]);
    reply.send({
      organizers,
      invites: invites.map((i) => ({
        id: i.id,
        email: i.email,
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
        invitedByName: i.invitedBy.name,
      })),
    });
  });

  // Invite a co-organizer — sends a link to /accept-invite?token=…, same
  // single-use hashed-token pattern as the email-change flow above. Requires
  // SMTP: there's no other way for the invitee to receive the link.
  app.post(
    "/api/settings/organizers/invite",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      if (!isEmailConfigured()) {
        reply.code(503).send({ error: "email_not_configured" });
        return;
      }
      const body = inviteOrganizerSchema.safeParse(request.body);
      if (!body.success) {
        reply.code(400).send({ error: "invalid_input" });
        return;
      }
      const taken = await prisma.organizerAccount.findUnique({ where: { email: body.data.email } });
      if (taken) {
        reply.code(409).send({ error: "email_taken" });
        return;
      }

      const orgId = request.organizer!.orgId;
      // A fresh invite supersedes any still-pending one for the same address —
      // re-inviting is how a lost/expired link gets resent, no separate
      // "resend" endpoint needed.
      await prisma.organizerInvite.deleteMany({
        where: { orgId, email: body.data.email, usedAt: null },
      });

      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const [org] = await Promise.all([
        prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
        prisma.organizerInvite.create({
          data: {
            orgId,
            email: body.data.email,
            tokenHash,
            invitedById: request.organizer!.id,
            expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
          },
        }),
      ]);

      const link = `${resolveBaseUrl(requestOrigin(request))}/accept-invite?token=${token}`;
      await sendMail({
        to: body.data.email,
        subject: `You're invited to join ${org.name} on LimitedGauntlet`,
        text: `${request.organizer!.name} invited you to co-organize ${org.name} on LimitedGauntlet. Accept by opening:\n\n${link}\n\nThis link expires in 7 days. If you weren't expecting this, ignore this email.`,
      });
      reply.send({ ok: true });
    },
  );

  app.delete("/api/settings/organizers/invites/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const { count } = await prisma.organizerInvite.deleteMany({
      where: { id: params.data.id, orgId: request.organizer!.orgId },
    });
    if (count === 0) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    reply.code(204).send();
  });

  // --- Data export (PI-38) ---
  // Machine-readable dump of the org's data. Which sections are included is
  // driven by query flags (the Settings popup's checkboxes); default is
  // everything. Session-auth only, like the rest of this file — an org's full
  // data export shouldn't be reachable with a bearer API token.
  app.get("/api/settings/export", async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const has = (key: string) => q[key] === "1" || q[key] === "true";
    const anySelected = has("data") || has("hallOfFame") || has("treasureVault");
    // No explicit selection ⇒ export everything (a bare /export is "give me all of it").
    const sections: ExportSections = anySelected
      ? { data: has("data"), hallOfFame: has("hallOfFame"), treasureVault: has("treasureVault") }
      : { data: true, hallOfFame: true, treasureVault: true };

    const payload = await buildOrgExport(request.organizer!.orgId, sections);
    reply
      .header("Content-Disposition", `attachment; filename="${payload.organization.slug}-export.json"`)
      .type("application/json")
      .send(payload);
  });

  // --- Data import (PI-39) ---
  // Accepts a file produced by the export above and rebuilds its `data` section
  // into THIS org. Idempotent at the tournament level (a same-named tournament
  // is skipped), so re-uploading is safe. Rate-limited — this is a heavy,
  // write-many operation.
  app.post(
    "/api/settings/import",
    // Bump the body limit well past Fastify's 1MB default — an export with card
    // images/history for several tournaments can run large.
    { bodyLimit: 25 * 1024 * 1024, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = parseOrgExport(request.body);
      if (!parsed.ok || !parsed.data) {
        reply.code(parsed.error === "import_too_large" ? 413 : 400).send({ error: parsed.error ?? "invalid_shape" });
        return;
      }
      try {
        const summary = await importOrgData(request.organizer!.orgId, parsed.data);
        reply.send({ ok: true, summary });
      } catch (err) {
        if (err instanceof ImportInProgressError) {
          reply.code(409).send({ error: "import_in_progress" });
          return;
        }
        // A reference error (unknown player/team/entrant in the file) — surface
        // it rather than 500ing, since it's a problem with the uploaded data.
        request.log.warn({ err }, "org import failed");
        reply.code(422).send({ error: "import_failed" });
      }
    },
  );

  // Remove a co-organizer's access. Self-removal is deliberately rejected here
  // — leaving the org goes through /settings/delete-account instead, which
  // re-verifies the leaving organizer's own password first.
  app.delete("/api/settings/organizers/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    if (params.data.id === request.organizer!.id) {
      reply.code(400).send({ error: "cannot_remove_self" });
      return;
    }
    const { count } = await prisma.organizerAccount.deleteMany({
      where: { id: params.data.id, orgId: request.organizer!.orgId },
    });
    if (count === 0) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    reply.code(204).send();
  });

  // --- Outbound webhook (PI-50) ---
  // Per-organization, off unless a URL is configured. Session-auth only,
  // like everything else in this file — a leaked API token must not be able
  // to read the signing secret or repoint the webhook.

  app.get("/api/settings/webhook", async (request, reply) => {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: request.organizer!.orgId },
      select: { webhookUrl: true, webhookSecret: true },
    });
    reply.send({ url: org.webhookUrl, secret: org.webhookSecret });
  });

  // Sets (or clears, with url: null) the webhook URL. Generates a secret on
  // first-ever configure; an existing secret is left alone so re-saving the
  // URL doesn't silently break an already-wired-up receiver.
  app.put("/api/settings/webhook", async (request, reply) => {
    const body = webhookUrlSchema.safeParse(request.body);
    if (!body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: request.organizer!.orgId },
      select: { webhookSecret: true },
    });
    const updated = await prisma.organization.update({
      where: { id: request.organizer!.orgId },
      data: {
        webhookUrl: body.data.url,
        webhookSecret: body.data.url === null ? null : (org.webhookSecret ?? generateWebhookSecret()),
      },
      select: { webhookUrl: true, webhookSecret: true },
    });
    reply.send({ url: updated.webhookUrl, secret: updated.webhookSecret });
  });

  // Rotates the signing secret without touching the URL — for "I think this
  // leaked" or just periodic hygiene.
  app.post("/api/settings/webhook/regenerate-secret", async (request, reply) => {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: request.organizer!.orgId },
      select: { webhookUrl: true },
    });
    if (!org.webhookUrl) {
      reply.code(400).send({ error: "not_configured" });
      return;
    }
    const updated = await prisma.organization.update({
      where: { id: request.organizer!.orgId },
      data: { webhookSecret: generateWebhookSecret() },
      select: { webhookUrl: true, webhookSecret: true },
    });
    reply.send({ url: updated.webhookUrl, secret: updated.webhookSecret });
  });

  app.post(
    "/api/settings/webhook/test",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const result = await sendTestWebhookEvent(request.organizer!.orgId);
      reply.send(result);
    },
  );
}
