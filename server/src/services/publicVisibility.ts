// PI-107/110 — a player can be hidden from the open public pages: either
// because they object to appearing there (Art. 21 GDPR), or because an
// organizer is pseudonymising a minor. While `Player.publicHiddenAt` is set,
// every `/api/public/...` response renders that player's name as their stable
// `publicAlias` ("Player 7F2A") instead of their real `displayName`. The
// organizer's own authenticated views and every standings / pairing /
// Gesamtwertung computation are untouched — this is a name substitution on the
// public read surface only, applied server-side (the public routes serve
// untrusted devices, so there is no client to trust).
//
// Pure helpers so the substitution rule is unit-testable without a real
// request/response — same idiom as pairingsVisibility.ts. `aliasById` is the
// map from services/playerPrivacy.ts#getHiddenPlayerAliases.

export interface Redactor {
  /** Whether this player id is hidden from public view. */
  isHidden(id: string | null | undefined): boolean;
  /** Public name for a player id given their real name (their alias if hidden). */
  name(id: string | null | undefined, realName: string): string;
  /**
   * Return a copy of a `{ id, displayName }` player object with `displayName`
   * swapped for the alias when hidden; pass through `null` / `undefined`.
   */
  player<T extends { id: string; displayName: string }>(p: T): T;
  player<T extends { id: string; displayName: string }>(p: T | null): T | null;
  player<T extends { id: string; displayName: string }>(p: T | undefined): T | undefined;
}

export function buildRedactor(aliasById: Map<string, string>): Redactor {
  const isHidden = (id: string | null | undefined): boolean => !!id && aliasById.has(id);
  const name = (id: string | null | undefined, realName: string): string => (id && aliasById.get(id)) || realName;
  function player<T extends { id: string; displayName: string }>(p: T | null | undefined): T | null | undefined {
    if (!p) return p;
    const alias = aliasById.get(p.id);
    return alias ? { ...p, displayName: alias } : p;
  }
  return { isHidden, name, player };
}

// PI-141 — what a public response may carry from a Tournament or Pod row.
//
// The public routes used to spread the raw Prisma row (`...tournament`,
// `...pod`), and neither ownership helper narrows with a `select`. That made
// every column public by default: a new column was published the moment its
// migration ran, with no code change and nothing failing. PI-126 fixed exactly
// this for `Round.onDemandWithdrawals`; these are the two models that never got
// the same treatment.
//
// These lists are deliberately exhaustive rather than an omit-list. Adding a
// column to the schema now publishes nothing until someone adds it here on
// purpose — which is the whole point, and what the key-set tests pin down.
// The fields below are exactly what was already public before this change, so
// nothing about the public pages moved.

export interface PublicTournamentFields {
  id: string;
  orgId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  location: string | null;
  description: string | null;
  status: string;
  tokenParticipation: number;
  tokenStandingBonuses: unknown;
  podsManuallyReordered: boolean;
  createdAt: Date;
}

export function publicTournamentFields<T extends PublicTournamentFields>(t: T): PublicTournamentFields {
  return {
    id: t.id,
    orgId: t.orgId,
    name: t.name,
    startDate: t.startDate,
    endDate: t.endDate,
    location: t.location,
    description: t.description,
    status: t.status,
    tokenParticipation: t.tokenParticipation,
    tokenStandingBonuses: t.tokenStandingBonuses,
    podsManuallyReordered: t.podsManuallyReordered,
    createdAt: t.createdAt,
  };
}

export interface PublicPodFields {
  id: string;
  tournamentId: string;
  name: string;
  date: Date | null;
  startTime: string | null;
  format: string;
  setCode: string | null;
  constructedFormat: string | null;
  constructedFormatCustom: string | null;
  sequenceOrder: number;
  isTeamEvent: boolean;
  teamSize: number | null;
  roundCount: number;
  matchFormat: string;
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  roundLengthMinutes: number;
  status: string;
  excludeFromStats: boolean;
  rarePicksEnabled: boolean;
  webhookEnabled: boolean;
  isMainEvent: boolean;
  prepTimerEndsAt: Date | null;
  prepTimerLabel: string | null;
  tokenParticipation: number | null;
  tokenStandingBonuses: unknown;
  completedAt: Date | null;
  canceledAt: Date | null;
  isOnDemand: boolean;
  actualStartedAt: Date | null;
  capacity: number | null;
  createdAt: Date;
}

export function publicPodFields<T extends PublicPodFields>(p: T): PublicPodFields {
  return {
    id: p.id,
    tournamentId: p.tournamentId,
    name: p.name,
    date: p.date,
    startTime: p.startTime,
    format: p.format,
    setCode: p.setCode,
    constructedFormat: p.constructedFormat,
    constructedFormatCustom: p.constructedFormatCustom,
    sequenceOrder: p.sequenceOrder,
    isTeamEvent: p.isTeamEvent,
    teamSize: p.teamSize,
    roundCount: p.roundCount,
    matchFormat: p.matchFormat,
    pointsWin: p.pointsWin,
    pointsDraw: p.pointsDraw,
    pointsLoss: p.pointsLoss,
    roundLengthMinutes: p.roundLengthMinutes,
    status: p.status,
    excludeFromStats: p.excludeFromStats,
    rarePicksEnabled: p.rarePicksEnabled,
    webhookEnabled: p.webhookEnabled,
    isMainEvent: p.isMainEvent,
    prepTimerEndsAt: p.prepTimerEndsAt,
    prepTimerLabel: p.prepTimerLabel,
    tokenParticipation: p.tokenParticipation,
    tokenStandingBonuses: p.tokenStandingBonuses,
    completedAt: p.completedAt,
    canceledAt: p.canceledAt,
    isOnDemand: p.isOnDemand,
    actualStartedAt: p.actualStartedAt,
    capacity: p.capacity,
    createdAt: p.createdAt,
  };
}
