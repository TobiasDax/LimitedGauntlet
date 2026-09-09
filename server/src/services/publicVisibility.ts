// PI-107 — a player (or an organizer on their behalf) can object, per Art. 21
// GDPR, to appearing on the open public pages. While `Player.publicHiddenAt`
// is set, every `/api/public/...` response renders that player's name as the
// placeholder below instead of their real `displayName`, and their public
// stats page 404s. The organizer's own authenticated views and every
// standings / pairing / Gesamtwertung computation are untouched — this is a
// name redaction on the public read surface only, applied server-side (the
// public routes serve untrusted devices, so there is no client to trust).
//
// Pure helpers so the redaction rule is unit-testable without a real
// request/response — same idiom as pairingsVisibility.ts.

export const HIDDEN_PLAYER_NAME = "Hidden player";

export interface Redactor {
  /** Whether this player id is hidden from public view. */
  isHidden(id: string | null | undefined): boolean;
  /** Public name for a player id given their real name. */
  name(id: string | null | undefined, realName: string): string;
  /**
   * Return a copy of a `{ id, displayName }` player object with `displayName`
   * replaced when hidden; pass through `null` / `undefined` unchanged.
   */
  player<T extends { id: string; displayName: string }>(p: T): T;
  player<T extends { id: string; displayName: string }>(p: T | null): T | null;
  player<T extends { id: string; displayName: string }>(p: T | undefined): T | undefined;
}

export function buildRedactor(hiddenIds: Iterable<string>): Redactor {
  const hidden = hiddenIds instanceof Set ? hiddenIds : new Set(hiddenIds);
  const isHidden = (id: string | null | undefined): boolean => !!id && hidden.has(id);
  function player<T extends { id: string; displayName: string }>(p: T | null | undefined): T | null | undefined {
    return p && isHidden(p.id) ? { ...p, displayName: HIDDEN_PLAYER_NAME } : p;
  }
  return {
    isHidden,
    name: (id, realName) => (isHidden(id) ? HIDDEN_PLAYER_NAME : realName),
    player,
  };
}
