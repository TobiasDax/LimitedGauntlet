// HI-4 — the read gate for content whose retention window has run out.
//
// Registered as a preHandler on the route groups that serve org content, so
// every one of them answers the question identically instead of each handler
// remembering to ask. Deliberately *not* registered on settings, auth or
// billing routes: an org whose data has locked must still be able to log in,
// see what happened and upgrade — locking someone out of the page that takes
// their money would be an own goal.
//
// Inaccessible is not deleted (ROADMAP-HOSTED.md rule 7): this refuses reads,
// and an upgrade brings everything back untouched.
import type { FastifyReply, FastifyRequest } from "fastify";
import { ENTITLEMENT_REQUIRED, isOrgDataAccessible } from "../services/entitlementAccess.js";

export async function requireOrgDataAccessible(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const orgId = request.organizer?.orgId;
  // No resolved organizer means this route's own auth hook already decided
  // what to do; there is no org to evaluate.
  if (!orgId) return;

  if (await isOrgDataAccessible(orgId)) return;

  await reply.code(402).send({ error: ENTITLEMENT_REQUIRED, reason: "data_expired" });
}
