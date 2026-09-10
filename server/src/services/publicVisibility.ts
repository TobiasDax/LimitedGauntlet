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
