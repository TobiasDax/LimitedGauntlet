// Proxies Scryfall's public REST API server-side. Per Scryfall's API
// guidelines (scryfall.com/docs/api): identify yourself with a descriptive
// User-Agent, and don't hammer the API — a short in-memory cache is the
// practical mitigation at this app's traffic scale (a handful of
// organizers adding a few pulls per pod), a full rate limiter would be
// over-engineering for that volume.

const USER_AGENT = "LimitedGauntlet/1.0 (self-hosted MTG tournament tracker; +https://[redacted-private-host]/tobias/LimitedGauntlet)";
const SCRYFALL_BASE = "https://api.scryfall.com";

const AUTOCOMPLETE_TTL_MS = 5 * 60_000;
const NAMED_TTL_MS = 60 * 60_000;
const SETS_TTL_MS = 24 * 60 * 60_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A burst of near-simultaneous lookups (e.g. bulk-syncing a decklist via
// the MCP server, one add_card_pull call per card with no delay between
// them) can trip Scryfall's own rate limit — a real, transient `429`, not
// "this card doesn't exist." One retry after a short backoff (honoring
// Retry-After when Scryfall sends one) absorbs that case before it ever
// reaches a caller as a failure. A genuine outage (repeated 5xx) still
// surfaces after the retry rather than looping forever.
async function scryfallFetch(path: string): Promise<Response> {
  const url = `${SCRYFALL_BASE}${path}`;
  const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };

  const res = await fetch(url, { headers });
  if (res.status !== 429 && res.status < 500) return res;

  const retryAfterHeader = Number(res.headers.get("retry-after"));
  const backoffMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader * 1000 : 750;
  await sleep(backoffMs);
  return fetch(url, { headers });
}

export async function autocompleteCardNames(query: string): Promise<string[]> {
  const key = `autocomplete:${query.toLowerCase()}`;
  const cached = getCached<string[]>(key);
  if (cached) return cached;

  const res = await scryfallFetch(`/cards/autocomplete?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { data: string[] };
  setCached(key, data.data, AUTOCOMPLETE_TTL_MS);
  return data.data;
}

export interface ScryfallCardSummary {
  scryfallId: string;
  name: string;
  setCode: string;
  priceEur: number | null;
  // The finish the priceEur above actually reflects — not necessarily
  // whatever was requested. A foil price requested on a nonfoil-only
  // print (or vice versa) falls back to whichever finish the print
  // actually has, rather than silently storing a null/wrong price; this
  // records which one that ended up being so the caller never mislabels
  // a nonfoil price as foil or vice versa.
  foil: boolean;
  imageUri: string | null;
}

interface ScryfallCardResponse {
  id: string;
  name: string;
  set: string;
  finishes?: string[];
  prices?: { eur?: string | null; eur_foil?: string | null };
  image_uris?: { normal?: string };
  card_faces?: Array<{ image_uris?: { normal?: string } }>;
}

function resolvePrice(card: ScryfallCardResponse, foilRequested: boolean): { priceEur: number | null; foil: boolean } {
  const finishes = card.finishes ?? [];
  const eur = card.prices?.eur ? Number(card.prices.eur) : null;
  const eurFoil = card.prices?.eur_foil ? Number(card.prices.eur_foil) : null;

  if (foilRequested && finishes.includes("foil")) return { priceEur: eurFoil, foil: true };
  if (!foilRequested && finishes.includes("nonfoil")) return { priceEur: eur, foil: false };

  // The requested finish isn't actually a real option on this print (e.g.
  // foil requested on a nonfoil-only common, or nonfoil requested on a
  // foil-only showcase/promo treatment) — fall back to whichever finish
  // the print actually has, rather than storing a null price for a finish
  // that was never available here.
  if (finishes.includes("foil") && eurFoil !== null) return { priceEur: eurFoil, foil: true };
  return { priceEur: eur, foil: false };
}

export interface LookupOptions {
  // Restricts resolution to one specific set (Scryfall's three-to-five
  // letter set code, e.g. "eoe") instead of Scryfall's own "best guess"
  // default printing — the whole point of this option: a card reprinted
  // across many sets (lands, staples) would otherwise silently resolve to
  // an unrelated set's printing.
  setCode?: string;
  foil?: boolean;
}

// Deliberately does NOT fall back to a different set if `name` doesn't
// exist in `setCode` — that silent fallback to an unrelated printing is
// exactly the bug this option exists to prevent. Returns null (same as
// "card not found") rather than guessing.
export async function lookupCardByName(name: string, options: LookupOptions = {}): Promise<ScryfallCardSummary | null> {
  const { setCode, foil = false } = options;
  const key = `named:${name.toLowerCase()}:${setCode?.toLowerCase() ?? ""}:${foil ? "foil" : "nonfoil"}`;
  const cached = getCached<ScryfallCardSummary | null>(key);
  if (cached !== undefined) return cached;

  const params = new URLSearchParams({ fuzzy: name });
  if (setCode) params.set("set", setCode.toLowerCase());
  const res = await scryfallFetch(`/cards/named?${params.toString()}`);
  if (!res.ok) {
    // Only a real 404 means "this card/set combination doesn't exist" —
    // caching that is correct and saves a repeat lookup. Any other
    // failure (a 429 that survived scryfallFetch's retry, a 5xx, a
    // network error) is transient, not a verdict on the card, and must
    // NOT be cached: caching it here previously poisoned every later
    // lookup of the same name+set+foil for a full hour, even once
    // Scryfall was healthy again — exactly what broke a bulk MCP sync
    // after the first rate-limited burst.
    if (res.status === 404) setCached(key, null, NAMED_TTL_MS);
    return null;
  }

  const card = (await res.json()) as ScryfallCardResponse;
  const { priceEur, foil: resolvedFoil } = resolvePrice(card, foil);
  const summary: ScryfallCardSummary = {
    scryfallId: card.id,
    name: card.name,
    setCode: card.set,
    priceEur,
    foil: resolvedFoil,
    imageUri: card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null,
  };

  setCached(key, summary, NAMED_TTL_MS);
  return summary;
}

export interface ScryfallSetSummary {
  code: string;
  name: string;
  releasedAt: string | null;
}

interface ScryfallSetResponse {
  code: string;
  name: string;
  set_type: string;
  digital: boolean;
  released_at: string | null;
}

// Every paper set from 2000 onward, alphabetized by name. Tried curating
// by set_type first (expansion/core, then masters/draft_innovation) and
// kept missing real drafted product each time (Mystery Booster 2,
// Innistrad Remastered, Modern Horizons) — not worth maintaining a
// set_type allowlist by hand when the picker itself is a searchable
// dropdown/datalist that handles a long alphabetized list fine. Only
// exclusions left: digital-only sets (Alchemy/Arena reprints — not
// something anyone's opening physical packs from) and anything before
// 2000 (pre-2000 product isn't what this group drafts, and it's most of
// what would otherwise pad out the list). A genuinely obscure printing
// (a bonus sheet, an old promo) still reaches the add-pull form's
// free-text override regardless of what's in this list.
const CUTOFF_YEAR = "2000-01-01";

export async function listMainSets(): Promise<ScryfallSetSummary[]> {
  const key = "sets:main";
  const cached = getCached<ScryfallSetSummary[]>(key);
  if (cached) return cached;

  const res = await scryfallFetch("/sets");
  if (!res.ok) return [];
  const data = (await res.json()) as { data: ScryfallSetResponse[] };

  const sets = data.data
    .filter((s) => !s.digital && s.released_at !== null && s.released_at >= CUTOFF_YEAR)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({ code: s.code, name: s.name, releasedAt: s.released_at }));

  setCached(key, sets, SETS_TTL_MS);
  return sets;
}
