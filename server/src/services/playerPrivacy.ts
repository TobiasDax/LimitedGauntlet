import { prisma } from "../prisma.js";

// GDPR data-subject-rights plumbing for roster players (PI-104 anonymise,
// PI-107 hide-from-public). The DB-touching logic lives here so it can be
// tested directly against a real Postgres (same pattern as
// services/playerAccounts.ts); the routes are thin HTTP wrappers.

// Roster names are unique within an org, case-insensitively — enforced
// app-layer (Postgres has no portable case-insensitive unique index without
// citext). Shared by routes/players.ts (organizer rename / create) and the
// PI-106 player self-rename so all three paths agree.
export async function rosterNameTaken(orgId: string, displayName: string, exceptId?: string): Promise<boolean> {
  const existing = await prisma.player.findFirst({
    where: {
      orgId,
      displayName: { equals: displayName, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  return existing !== null;
}

export interface AnonymiseResult {
  id: string;
  displayName: string;
  alreadyAnonymised: boolean;
}

// PI-104 — anonymise a roster entry to honour an Art. 17 erasure request
// without destroying the competitive record. In one transaction: scrub the
// name to a stable non-identifying label, clear the login email + identity
// link, delete pending invites, and blank token-ledger note text — while
// keeping every Entrant / Match / CardPull / TokenTransaction row, so
// standings, Gesamtwertung and Hall of Fame numbers are byte-identical
// afterwards. Idempotent: a no-op returning the current state if already
// anonymised. Returns null when the player isn't in this org.
export async function anonymisePlayer(orgId: string, playerId: string): Promise<AnonymiseResult | null> {
  const player = await prisma.player.findFirst({ where: { id: playerId, orgId } });
  if (!player) return null;
  if (player.anonymisedAt) {
    return { id: player.id, displayName: player.displayName, alreadyAnonymised: true };
  }

  // The cuid tail keeps two anonymisations in one org from colliding on the
  // case-insensitive unique-name check, without leaking anything about the
  // person.
  const label = `Anonymised player ${player.id.slice(-6)}`;

  await prisma.$transaction([
    prisma.player.update({
      where: { id: player.id },
      data: { displayName: label, email: null, identityId: null, anonymisedAt: new Date() },
    }),
    prisma.playerInvite.deleteMany({ where: { playerId: player.id } }),
    // Token-ledger notes are free text an organizer may have used to name the
    // person or spell out a reason. Scrub the text; the deltas (and therefore
    // the balance) are untouched.
    prisma.tokenTransaction.updateMany({
      where: { playerId: player.id, note: { not: null } },
      data: { note: null },
    }),
  ]);

  return { id: player.id, displayName: label, alreadyAnonymised: false };
}

// PI-107 — set or clear the "hide from public pages" objection flag. Returns
// null when the player isn't in this org.
export async function setPlayerPublicHidden(
  orgId: string,
  playerId: string,
  hidden: boolean,
): Promise<{ id: string; publicHiddenAt: Date | null } | null> {
  const existing = await prisma.player.findFirst({
    where: { id: playerId, orgId },
    select: { id: true, publicHiddenAt: true },
  });
  if (!existing) return null;
  // Don't rewrite an existing timestamp when it's already in the target state.
  if (hidden === (existing.publicHiddenAt !== null)) return existing;

  return prisma.player.update({
    where: { id: existing.id },
    data: { publicHiddenAt: hidden ? new Date() : null },
    select: { id: true, publicHiddenAt: true },
  });
}

// PI-107 — the set of this org's player ids that are hidden from public view.
// Loaded once per public request and threaded through buildRedactor
// (services/publicVisibility.ts).
export async function getHiddenPlayerIds(orgId: string): Promise<Set<string>> {
  const rows = await prisma.player.findMany({
    where: { orgId, publicHiddenAt: { not: null } },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}
