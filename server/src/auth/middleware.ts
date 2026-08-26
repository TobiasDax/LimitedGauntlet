import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../prisma.js";
import { hashApiToken } from "./apiToken.js";

function setOrganizer(request: FastifyRequest, account: { id: string; orgId: string; email: string; name: string }) {
  request.organizer = {
    id: account.id,
    orgId: account.orgId,
    email: account.email,
    name: account.name,
  };
}

// A bearer token acts AS the organizer who minted it — identical
// multi-tenancy scope (request.organizer.orgId) as that organizer's own
// session, no more. Returns true if a valid token was found and applied.
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

  setOrganizer(request, apiToken.organizer);
  // Best-effort, doesn't block the request on it.
  void prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return true;
}

// Attaches request.organizer, scoped to their own org, for any route that
// needs it. Every org-scoped query downstream must filter by
// request.organizer.orgId — that's the entire multi-tenancy boundary.
// Accepts either a session cookie (the browser app) or an
// `Authorization: Bearer <token>` header (non-browser clients, e.g. the
// MCP server) — checked in that order, bearer only as a fallback.
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const organizerId = request.session.get("organizerId");
  if (organizerId) {
    const account = await prisma.organizerAccount.findUnique({ where: { id: organizerId } });
    const sessionVersion = request.session.get("authVersion");
    if (!account || (sessionVersion ?? 0) !== account.authVersion) {
      request.session.delete();
      reply.code(401).send({ error: "unauthenticated" });
      return;
    }
    setOrganizer(request, account);
    return;
  }

  if (await tryBearerAuth(request)) return;

  reply.code(401).send({ error: "unauthenticated" });
}

// Session-cookie only, no bearer fallback — for the API token management
// routes themselves, so a leaked bearer token can never be used to mint or
// revoke tokens (including revoking others, or minting itself replacements
// after rotation). Only a real browser login can manage tokens.
export async function requireSessionAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const organizerId = request.session.get("organizerId");
  if (!organizerId) {
    reply.code(401).send({ error: "unauthenticated" });
    return;
  }
  const account = await prisma.organizerAccount.findUnique({ where: { id: organizerId } });
  const sessionVersion = request.session.get("authVersion");
  if (!account || (sessionVersion ?? 0) !== account.authVersion) {
    request.session.delete();
    reply.code(401).send({ error: "unauthenticated" });
    return;
  }
  setOrganizer(request, account);
}
