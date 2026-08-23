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
