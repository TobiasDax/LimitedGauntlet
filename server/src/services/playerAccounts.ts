import type { FastifyRequest } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../prisma.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { rosterNameTaken } from "./playerPrivacy.js";

// Player self-service accounts (PI-52). The DB-touching logic lives here so it
// can be tested directly against a real Postgres (same pattern as
// services/oidcRelink.ts); routes/playerAccounts.ts is the thin HTTP + email
// wrapper on top. Deliberately imports only prisma + password — no config /
// mailer — so importing this never requires SESSION_SECRET.

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type PlayerAccountError =
  | "not_found"
  | "already_has_account"
  | "anonymised"
  | "name_taken"
  | "email_taken"
  | "invalid_or_expired"
  | "wrong_password"
  | "not_your_match"
  | "round_not_active";

export class PlayerAccountFailure extends Error {
  constructor(public code: PlayerAccountError) {
    super(code);
  }
}

export function isPlayerAccountFailure(err: unknown): err is PlayerAccountFailure {
  return err instanceof PlayerAccountFailure;
}

// Create (or replace the pending) invite for a roster player. Returns the raw
// token — only its hash is stored.
export async function createPlayerInvite(
  orgId: string,
  playerId: string,
  invitedById: string,
  email: string,
): Promise<{ token: string; playerName: string }> {
  const player = await prisma.player.findFirst({ where: { id: playerId, orgId } });
  if (!player) throw new PlayerAccountFailure("not_found");
  if (player.identityId) throw new PlayerAccountFailure("already_has_account");
  // PI-104 — an anonymised roster entry can't be re-attached to a login.
  if (player.anonymisedAt) throw new PlayerAccountFailure("anonymised");

  const emailTaken = await prisma.player.findFirst({
    where: { orgId, email, id: { not: playerId } },
  });
  if (emailTaken) throw new PlayerAccountFailure("email_taken");

  const token = randomBytes(32).toString("hex");
  await prisma.$transaction([
    prisma.playerInvite.deleteMany({ where: { playerId, usedAt: null } }),
    prisma.playerInvite.create({
      data: {
        orgId,
        playerId,
        email,
        tokenHash: hashInviteToken(token),
        invitedById,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    }),
  ]);
  return { token, playerName: player.displayName };
}

export async function getPlayerInvite(token: string) {
  const invite = await prisma.playerInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: {
      player: { select: { displayName: true } },
      organization: { select: { name: true, slug: true } },
    },
  });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) return null;
  return invite;
}

// PI-86 — links the invited Player row to the shared PlayerIdentity for that
// email, creating the identity (with this password) if it's the person's first
// player login anywhere. When the identity already exists, the given password
// must match it (proves it's them) — the invite is bound to that identity.
export async function acceptPlayerInvite(token: string, password: string) {
  const invite = await prisma.playerInvite.findUnique({ where: { tokenHash: hashInviteToken(token) } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    throw new PlayerAccountFailure("invalid_or_expired");
  }
  const taken = await prisma.player.findFirst({
    where: { orgId: invite.orgId, email: invite.email, id: { not: invite.playerId } },
  });
  if (taken) throw new PlayerAccountFailure("email_taken");

  let identity = await prisma.playerIdentity.findUnique({ where: { email: invite.email } });
  if (identity) {
    if (!(await verifyPassword(identity.passwordHash, password))) {
      throw new PlayerAccountFailure("wrong_password");
    }
  } else {
    identity = await prisma.playerIdentity.create({
      data: { email: invite.email, passwordHash: await hashPassword(password) },
    });
  }

  const [player] = await prisma.$transaction([
    prisma.player.update({ where: { id: invite.playerId }, data: { email: invite.email, identityId: identity.id } }),
    prisma.playerInvite.update({ where: { id: invite.id }, data: { usedAt: new Date() } }),
  ]);
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: invite.orgId } });
  return { identity, player, organization };
}

// PI-106 — a logged-in player corrects their own display name (Art. 16) in
// the org their portal session is in. Same case-insensitive uniqueness rule
// as the organizer rename route; an anonymised entry is frozen.
export async function renameOwnPlayer(orgId: string, playerId: string, displayName: string) {
  const player = await prisma.player.findFirst({ where: { id: playerId, orgId } });
  if (!player) throw new PlayerAccountFailure("not_found");
  if (player.anonymisedAt) throw new PlayerAccountFailure("anonymised");
  if (await rosterNameTaken(orgId, displayName, playerId)) throw new PlayerAccountFailure("name_taken");
  return prisma.player.update({ where: { id: playerId }, data: { displayName } });
}

export async function authenticatePlayer(orgSlug: string, email: string, password: string) {
  const organization = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!organization) return null;
  const identity = await prisma.playerIdentity.findUnique({ where: { email } });
  if (!identity || !(await verifyPassword(identity.passwordHash, password))) return null;
  const player = await prisma.player.findFirst({ where: { identityId: identity.id, orgId: organization.id } });
  if (!player) return null;
  return { identity, player, organization };
}

// PI-86 — revoke unlinks THIS org's Player row from the identity (and clears
// its denormalized email). The identity row survives — the player keeps any
// login for other orgs. The unlink alone drops the live session for this org
// (playerMiddleware.ts re-checks the (identity, org) link every request), so
// no authVersion bump. Returns rows touched (0 = not this org's player).
export async function revokePlayerAccount(orgId: string, playerId: string): Promise<number> {
  const { count } = await prisma.player.updateMany({
    where: { id: playerId, orgId, identityId: { not: null } },
    data: { email: null, identityId: null },
  });
  if (count > 0) await prisma.playerInvite.deleteMany({ where: { playerId } });
  return count;
}

// True when the request carries a still-valid player session for this org —
// used by the PI-27 public-lock bypass and the realtime room authorizer.
export async function hasValidPlayerSession(request: FastifyRequest, orgId: string): Promise<boolean> {
  const identityId = request.session.get("playerIdentityId");
  if (!identityId) return false;
  const [identity, player] = await Promise.all([
    prisma.playerIdentity.findUnique({ where: { id: identityId }, select: { authVersion: true } }),
    prisma.player.findFirst({ where: { identityId, orgId }, select: { id: true } }),
  ]);
  if (!identity || !player) return false;
  const sessionVersion = request.session.get("playerAuthVersion");
  return (sessionVersion ?? 0) === identity.authVersion;
}

function playerOnEntrant(
  entrant: { playerId: string | null; team: { members: { playerId: string }[] } | null } | null,
  playerId: string,
): boolean {
  if (!entrant) return false;
  return entrant.playerId === playerId || (entrant.team?.members.some((m) => m.playerId === playerId) ?? false);
}

// Records a player-reported result for a match they're in. Authorizes:
// the match is in the player's org, its round is ACTIVE, and the player sits
// on entrant A or B (individually or via a team). Derives the result from the
// game counts, clamped to the pod's match format. Mirrors the write done by
// the organizer route (rounds.ts PATCH /api/matches/:id/result).
export async function submitPlayerResult(
  matchId: string,
  orgId: string,
  playerId: string,
  gamesWonAInput: number,
  gamesWonBInput: number,
) {
  const match = await prisma.match.findFirst({
    where: { id: matchId, round: { pod: { tournament: { orgId } } } },
    include: {
      entrantA: { select: { playerId: true, team: { select: { members: { select: { playerId: true } } } } } },
      entrantB: { select: { playerId: true, team: { select: { members: { select: { playerId: true } } } } } },
      round: { select: { status: true, podId: true, pod: { select: { matchFormat: true, tournamentId: true } } } },
    },
  });
  if (!match || !match.entrantBId) throw new PlayerAccountFailure("not_found");
  if (!playerOnEntrant(match.entrantA, playerId) && !playerOnEntrant(match.entrantB, playerId)) {
    throw new PlayerAccountFailure("not_your_match");
  }
  if (match.round.status !== "ACTIVE") throw new PlayerAccountFailure("round_not_active");

  const maxGames = match.round.pod.matchFormat === "BO1" ? 1 : 2;
  const gamesWonA = Math.max(0, Math.min(gamesWonAInput, maxGames));
  const gamesWonB = Math.max(0, Math.min(gamesWonBInput, maxGames));
  const result = gamesWonA > gamesWonB ? "A_WINS" : gamesWonB > gamesWonA ? "B_WINS" : "DRAW";

  const updated = await prisma.match.update({
    where: { id: match.id },
    data: { gamesWonA, gamesWonB, result, reportedAt: new Date() },
  });
  return { match: updated, podId: match.round.podId, tournamentId: match.round.pod.tournamentId };
}
