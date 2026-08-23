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

function scryfallFetch(path: string): Promise<Response> {
  return fetch(`${SCRYFALL_BASE}${path}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
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
  imageUri: string | null;
}

interface ScryfallCardResponse {
  id: string;
  name: string;
  set: string;
  prices?: { eur?: string | null };
  image_uris?: { normal?: string };
  card_faces?: Array<{ image_uris?: { normal?: string } }>;
}

export async function lookupCardByName(name: string): Promise<ScryfallCardSummary | null> {
  const key = `named:${name.toLowerCase()}`;
  const cached = getCached<ScryfallCardSummary | null>(key);
  if (cached !== undefined) return cached;

  const res = await scryfallFetch(`/cards/named?fuzzy=${encodeURIComponent(name)}`);
  if (!res.ok) {
    setCached(key, null, NAMED_TTL_MS);
    return null;
  }

  const card = (await res.json()) as ScryfallCardResponse;
  const summary: ScryfallCardSummary = {
    scryfallId: card.id,
    name: card.name,
    setCode: card.set,
    priceEur: card.prices?.eur ? Number(card.prices.eur) : null,
    imageUri: card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null,
  };

  setCached(key, summary, NAMED_TTL_MS);
  return summary;
}
