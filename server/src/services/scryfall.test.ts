import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupCardByName } from "./scryfall.js";

// Regression coverage for the poisoned-cache bug: a transient Scryfall
// failure (429/5xx) must never be cached as "card not found" the way a
// real 404 correctly is — that's what turned one rate-limited burst into
// an hour of every later lookup of the same card failing too.

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

const realCard = {
  id: "test-id",
  name: "Test Card",
  set: "tst",
  finishes: ["nonfoil"],
  prices: { eur: "1.23" },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lookupCardByName", () => {
  it("retries once on 429 and succeeds without treating it as a failure", async () => {
    const fetchMock = vi
      .fn()
      // A tiny (but nonzero, so it's honored) retry-after keeps this test fast.
      .mockResolvedValueOnce(jsonResponse(429, { error: "rate limited" }, { "retry-after": "0.01" }))
      .mockResolvedValueOnce(jsonResponse(200, realCard));
    vi.stubGlobal("fetch", fetchMock);

    const result = await lookupCardByName("Test Card 429");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Test Card");
  });

  it("does not cache a transient 5xx failure — the next call retries against Scryfall again", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { error: "internal error" }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await lookupCardByName("Test Card 500");
    expect(first).toBeNull();
    const callsAfterFirst = fetchMock.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0); // scryfallFetch's own retry already fired

    const second = await lookupCardByName("Test Card 500");
    expect(second).toBeNull();
    // A cached negative result would mean zero additional fetch calls here.
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it("still caches a genuine 404 as not-found, unchanged from before", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { error: "not found" }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await lookupCardByName("Test Card Nonexistent");
    expect(first).toBeNull();
    const callsAfterFirst = fetchMock.mock.calls.length;

    const second = await lookupCardByName("Test Card Nonexistent");
    expect(second).toBeNull();
    // Cached: the second lookup must not hit fetch again at all.
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });
});
