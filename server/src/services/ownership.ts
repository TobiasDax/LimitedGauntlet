import { prisma } from "../prisma.js";

// Shared "find X, scoped to this org" lookups. Every org-scoped route uses
// one of these (or the equivalent updateMany/deleteMany where-clause
// pattern) rather than looking entities up by id alone — that's the whole
// multi-tenancy boundary, so it stays in one place instead of being
// re-derived per route file.

export function findOwnedTournament(tournamentId: string, orgId: string) {
  return prisma.tournament.findFirst({ where: { id: tournamentId, orgId } });
}

export function findOwnedPod(podId: string, orgId: string) {
  return prisma.pod.findFirst({ where: { id: podId, tournament: { orgId } } });
}

export function findOwnedRound(roundId: string, orgId: string) {
  return prisma.round.findFirst({ where: { id: roundId, pod: { tournament: { orgId } } } });
}

export function findOwnedMatch(matchId: string, orgId: string) {
  return prisma.match.findFirst({ where: { id: matchId, round: { pod: { tournament: { orgId } } } } });
}

export function findOwnedCardPull(cardPullId: string, orgId: string) {
  return prisma.cardPull.findFirst({ where: { id: cardPullId, pod: { tournament: { orgId } } } });
}

// Slug-scoped equivalents for the public, unauthenticated pages — same
// shape as the orgId-scoped lookups above, but the org itself is the
// access control (an unguessable cuid isn't the boundary here, the slug
// is meant to be shared; every one of these routes is read-only).
export function findPublicTournament(orgSlug: string, tournamentId: string) {
  return prisma.tournament.findFirst({ where: { id: tournamentId, organization: { slug: orgSlug } } });
}

export function findPublicPod(orgSlug: string, podId: string) {
  return prisma.pod.findFirst({ where: { id: podId, tournament: { organization: { slug: orgSlug } } } });
}

// The org itself, for org-wide public pages (Hall of Fame, Treasure
// Chest) that aren't scoped to any one tournament or pod — same trust
// model as the rest of this file, the slug is the whole access control.
export function findPublicOrganization(orgSlug: string) {
  return prisma.organization.findUnique({ where: { slug: orgSlug } });
}
