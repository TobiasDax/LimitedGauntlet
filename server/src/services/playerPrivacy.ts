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
      data: {
        displayName: label,
        email: null,
        identityId: null,
        anonymisedAt: new Date(),
        // The scrubbed label is a safe public name on its own — collapse the
        // PI-110 pseudonym state so there's one consistent public identity.
        publicHiddenAt: null,
        publicAlias: null,
      },
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

// PI-110 — the public handle for a hidden player: "Player " + a 4-char code
// from an unambiguous alphabet (no 0/O/1/I/L, no vowels — avoids both misreads
// and accidental words). ~530k combinations, far more than any roster.
const ALIAS_ALPHABET = "23456789BCDFGHJKMNPQRSTVWXYZ";

// One candidate handle, "Player " + a 4-char code. Exported so orgImport can
// generate aliases inside its own transaction.
export function randomPublicAlias(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += ALIAS_ALPHABET[Math.floor(Math.random() * ALIAS_ALPHABET.length)];
  }
  return `Player ${code}`;
}

// A per-org-unique alias. Retries on the (very unlikely) collision.
async function generatePublicAlias(orgId: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const alias = randomPublicAlias();
    const clash = await prisma.player.findFirst({ where: { orgId, publicAlias: alias }, select: { id: true } });
    if (!clash) return alias;
  }
  // Astronomically unlikely; fall back to something guaranteed-unique.
  return `Player ${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

export interface PlayerPublicHiddenResult {
  id: string;
  publicHiddenAt: Date | null;
  publicAlias: string | null;
}

// PI-107/110 — set or clear the "hide from public pages" flag. When setting it
// and the player has no `publicAlias` yet, generate a stable one; keep it on
// un-hide so a later re-hide reuses the same handle. Returns null when the
// player isn't in this org.
export async function setPlayerPublicHidden(
  orgId: string,
  playerId: string,
  hidden: boolean,
): Promise<PlayerPublicHiddenResult | null> {
  const existing = await prisma.player.findFirst({
    where: { id: playerId, orgId },
    select: { id: true, publicHiddenAt: true, publicAlias: true },
  });
  if (!existing) return null;

  const needsAlias = hidden && !existing.publicAlias;
  // Nothing to do: already in the target hidden-state and (if hidden) has a handle.
  if (hidden === (existing.publicHiddenAt !== null) && !needsAlias) return existing;

  return prisma.player.update({
    where: { id: existing.id },
    data: {
      publicHiddenAt: hidden ? (existing.publicHiddenAt ?? new Date()) : null,
      ...(needsAlias ? { publicAlias: await generatePublicAlias(orgId) } : {}),
    },
    select: { id: true, publicHiddenAt: true, publicAlias: true },
  });
}

// PI-110 — this org's hidden players mapped to the public handle to show for
// each. Loaded once per public request and threaded through buildRedactor
// (services/publicVisibility.ts).
export async function getHiddenPlayerAliases(orgId: string): Promise<Map<string, string>> {
  const rows = await prisma.player.findMany({
    where: { orgId, publicHiddenAt: { not: null } },
    select: { id: true, publicAlias: true },
  });
  return new Map(rows.map((r) => [r.id, r.publicAlias ?? HIDDEN_PLAYER_FALLBACK]));
}

// Used only if a hidden player somehow has no stored alias (shouldn't happen
// once setPlayerPublicHidden backfills one).
export const HIDDEN_PLAYER_FALLBACK = "Hidden player";
