import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../prisma.js";
import { hashApiToken } from "./apiToken.js";

type AccountRow = { id: string; email: string; name: string; passwordHash: string | null };

function setIdentity(request: FastifyRequest, account: AccountRow): void {
  request.identity = {
    id: account.id,
    email: account.email,
    name: account.name,
    hasPassword: account.passwordHash != null,
  };
}

function setOrganizer(request: FastifyRequest, account: AccountRow, orgId: string): void {
  request.organizer = {
    id: account.id,
    orgId,
    email: account.email,
    name: account.name,
    hasPassword: account.passwordHash != null,
  };
}

// PI-86 — resolve which org an organizer session is acting in. Returns the
// org id, or null when the session must go pick one via the chooser:
//   - session's activeOrgId still names a current membership → use it
//   - activeOrgId set but no longer a membership → null (don't silently
//     re-pick; the user consciously re-selects)
//   - activeOrgId unset (fresh login) → lastActiveOrgId if it's a membership,
//     else the oldest membership; written back into the session. null only if
//     the account has zero memberships.
async function resolveActiveOrg(
  request: FastifyRequest,
  account: { id: string; lastActiveOrgId: string | null },
): Promise<string | null> {
  const memberships = await prisma.organizerMembership.findMany({
    where: { accountId: account.id },
    orderBy: { createdAt: "asc" },
    select: { orgId: true },
  });
  const orgIds = new Set(memberships.map((m) => m.orgId));
  if (orgIds.size === 0) return null;

  const active = request.session.get("activeOrgId");
  if (active !== undefined) {
    return orgIds.has(active) ? active : null;
  }

  const resolved =
    account.lastActiveOrgId && orgIds.has(account.lastActiveOrgId) ? account.lastActiveOrgId : memberships[0]!.orgId;
  request.session.set("activeOrgId", resolved);
  return resolved;
}

// Loads the organizer account from the session cookie and verifies authVersion.
// Sets request.identity always; returns the account row (with lastActiveOrgId)
// so callers can resolve the active org, or null after having 401'd.
async function loadSessionAccount(request: FastifyRequest, reply: FastifyReply) {
  const organizerId = request.session.get("organizerId");
  if (!organizerId) {
    reply.code(401).send({ error: "unauthenticated" });
    return null;
  }
  const account = await prisma.organizerAccount.findUnique({ where: { id: organizerId } });
  const sessionVersion = request.session.get("authVersion");
  if (!account || (sessionVersion ?? 0) !== account.authVersion) {
    request.session.delete();
    reply.code(401).send({ error: "unauthenticated" });
    return null;
  }
  setIdentity(request, account);
  return account;
}

// A bearer token acts AS the organizer who minted it, IN the one org the token
// is scoped to (PI-86 — a token can't inherit "the" org from a multi-org
// account). Returns true if a valid token was found and applied.
async function tryBearerAuth(request: FastifyRequest): Promise<boolean> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;

  const plaintext = header.slice("Bearer ".length).trim();
  if (!plaintext) return false;

  const apiToken = await prisma.apiToken.findUnique({
    where: { tokenHash: hashApiToken(plaintext) },
    include: { organizer: true },
  });
  if (!apiToken) return false;

  // The membership could have been removed after the token was minted (a
  // belt-and-braces check — leave-org also deletes the org's tokens).
  const membership = await prisma.organizerMembership.findUnique({
    where: { accountId_orgId: { accountId: apiToken.organizerId, orgId: apiToken.orgId } },
    select: { id: true },
  });
  if (!membership) return false;

  setIdentity(request, apiToken.organizer);
  setOrganizer(request, apiToken.organizer, apiToken.orgId);
  // Best-effort, doesn't block the request on it.
  void prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return true;
}

// Identity-only: a valid organizer login, active org NOT required. For
// /auth/me, /auth/organizations, /auth/switch-org — the endpoints that have to
// work while the session is between orgs. Resolves + attaches request.organizer
// too when an active org is available, so those routes can use it opportunistically.
export async function requireOrganizerIdentity(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const account = await loadSessionAccount(request, reply);
  if (!account) return;
  const orgId = await resolveActiveOrg(request, account);
  if (orgId) setOrganizer(request, account, orgId);
}

// Attaches request.organizer, scoped to the active org, for any route that
// needs it. Session cookie or `Authorization: Bearer <token>` (checked in that
// order, bearer only as a fallback). 403 org_selection_required when the login
// is valid but has no resolvable active org — the frontend routes to the chooser.
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const organizerId = request.session.get("organizerId");
  if (organizerId) {
    const account = await loadSessionAccount(request, reply);
    if (!account) return;
    const orgId = await resolveActiveOrg(request, account);
    if (!orgId) {
      reply.code(403).send({ error: "org_selection_required" });
      return;
    }
    setOrganizer(request, account, orgId);
    return;
  }

  if (await tryBearerAuth(request)) return;

  reply.code(401).send({ error: "unauthenticated" });
}

// Session-cookie only, no bearer fallback — for the API token management routes
// themselves, so a leaked bearer token can never mint or revoke tokens. Same
// active-org handling as requireAuth.
export async function requireSessionAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const account = await loadSessionAccount(request, reply);
  if (!account) return;
  const orgId = await resolveActiveOrg(request, account);
  if (!orgId) {
    reply.code(403).send({ error: "org_selection_required" });
    return;
  }
  setOrganizer(request, account, orgId);
}
