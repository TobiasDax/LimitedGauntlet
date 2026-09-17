// PI-85 follow-up — proxy the deployer's analytics script + collect endpoint
// same-origin instead of pointing the browser straight at the tracking
// vendor's own domain. Two problems with the original CSP-allowlist
// approach, found the hard way on the marketing site (LimitedGauntlet-
// Lander, a separate static site, fixed there first — see that repo's
// ANALYTICS-CSP-FINDINGS.md): a self-hoster's own reverse proxy / CDN /
// hosting platform may set its own CSP that clashes with the header this
// app sends, and a third-party "analytics.*" host serving a stock
// "script.js" filename is exactly the pattern most ad-blocker lists
// (EasyPrivacy etc.) filter — silently, with nothing visible in devtools to
// debug. Proxying same-origin sidesteps both: the browser only ever talks
// to this app's own origin, so the CSP can stay script-src/connect-src
// 'self' unconditionally (routes/tracking.ts), and there's no third-party
// hostname for a blocklist to match.
//
// Split out from routes/tracking.ts (untested, per this repo's
// service-layer-only testing convention) so the actual forwarding behavior
// is covered by tracking.test.ts against a real local HTTP server, same
// idiom as webhooks.ts/deliverWebhook.

// Same 5s ceiling as deliverWebhook (webhooks.ts) and the same reasoning: a
// slow/dead upstream must never hold a request open indefinitely. GET
// /stats.js loads on every rendered page and POST /api/send fires on every
// analytics event, both unauthenticated, so an upstream that hangs instead
// of erroring would otherwise tie up a server-side socket per request for
// as long as Node's default fetch timeouts (5 minutes) allow.
const FETCH_TIMEOUT_MS = 5_000;

// PI-129 — expand a possibly-compressed IPv6 address (the `::` run-of-zeros
// shorthand) into its full 8 groups, or null if it isn't validly shaped.
// truncateIp below needs this because naively splitting on ":" and dropping
// empty strings (the old approach) loses exactly the zero groups `::`
// represents — e.g. "2001:db8::1234:5678" (a /32 prefix plus a 4-group
// suffix) split-and-filtered gives ["2001","db8","1234","5678"], silently
// treating "1234" as if it were the third real group instead of a zero one,
// so the "first 3 groups" truncation below kept host-identifying bits
// instead of the intended /48 network prefix.
function expandIPv6Groups(address: string): string[] | null {
  if ((address.match(/::/g) ?? []).length > 1) return null; // "::" can appear at most once
  const isGroup = (g: string) => /^[0-9a-fA-F]{1,4}$/.test(g);

  const sides = address.split("::");
  if (sides.length === 1) {
    // No compression — must spell out exactly 8 groups.
    const groups = address.split(":");
    return groups.length === 8 && groups.every(isGroup) ? groups : null;
  }

  // sides.length === 2: "::" splits the address into what comes before and
  // after the compressed run. Either side can be empty ("::1", "2001:db8::",
  // or bare "::"), which is why filtering empty strings is wrong in
  // general — an empty side means "zero groups here", not "one".
  const head = sides[0] ? sides[0].split(":") : [];
  const tail = sides[1] ? sides[1].split(":") : [];
  const zerosNeeded = 8 - head.length - tail.length;
  if (zerosNeeded < 0) return null; // too many groups already, "::" was compressing nothing
  const groups = [...head, ...Array<string>(zerosNeeded).fill("0"), ...tail];
  return groups.length === 8 && groups.every(isGroup) ? groups : null;
}

// PI-108 — coarsen a client IP before it's forwarded to the analytics
// collector: drop the last IPv4 octet (/24) or the IPv6 host bits (keep /48).
// Enough for country/region geo, not a full address. Anything that doesn't
// look like an IP is passed through unchanged (shouldn't happen — the caller
// hands us Fastify's request.ip).
export function truncateIp(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(ip);
  const v4 = mapped ? mapped[1] : /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip) ? ip : null;
  if (v4) {
    const octets = v4.split(".");
    return `${octets[0]}.${octets[1]}.${octets[2]}.0`;
  }
  if (ip.includes(":")) {
    // PI-129 — a zone id (e.g. a link-local "fe80::1%eth0") is a local
    // interface label, never meaningful once the address leaves this host;
    // strip it before parsing rather than let it corrupt group parsing.
    const withoutZone = ip.split("%")[0]!;
    const groups = expandIPv6Groups(withoutZone);
    if (!groups) {
      // Genuinely unparseable — request.ip should never actually produce
      // this, but if it somehow did, the one thing that must never happen
      // is falling back to the untruncated raw address. "::" (every bit
      // zeroed) is the safest possible value: maximally coarse, leaks
      // nothing, still recognizably an IPv6 placeholder rather than a v4
      // fallback that would misrepresent the protocol.
      return "::";
    }
    // Normalize each kept group to its canonical (no leading zeros) form —
    // matches how the rest of this codebase's IPv6 literals are written,
    // and how the address would round-trip through most IPv6 libraries.
    const prefix = groups.slice(0, 3).map((g) => parseInt(g, 16).toString(16));
    // Trailing "0" groups right before the "::" we're about to append are
    // redundant — "::" already means "zero from here on" — so trim them
    // (down to nothing, for an all-zero prefix like "::1" or "::") to get
    // the same canonical text for equivalent addresses regardless of how
    // much of the zero run the input happened to spell out explicitly.
    while (prefix.length > 0 && prefix[prefix.length - 1] === "0") prefix.pop();
    return `${prefix.join(":")}::`;
  }
  return ip;
}

export interface ProxiedScript {
  status: number;
  contentType: string;
  body: ArrayBuffer;
}

// Never throws — a hung/unreachable/erroring upstream degrades to a 504
// response for the route handler to relay, same "caller never has to
// catch" posture as deliverWebhook.
export async function proxyTrackingScript(scriptUrl: string): Promise<ProxiedScript> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(scriptUrl, { signal: controller.signal });
    return {
      status: res.status,
      contentType: res.headers.get("content-type") ?? "application/javascript",
      body: await res.arrayBuffer(),
    };
  } catch {
    return { status: 504, contentType: "text/plain", body: new ArrayBuffer(0) };
  } finally {
    clearTimeout(timeout);
  }
}

export interface ProxiedSend {
  status: number;
  contentType: string;
  body: string;
}

// Umami's tracker script (served via proxyTrackingScript above) hardcodes
// its collect endpoint as `${scriptOrigin}/api/send` — computed client-side
// from wherever the script itself was loaded from, not something a
// deployer/this app configures. That's why routes/tracking.ts mounts this
// at exactly POST /api/send: it's Umami's fixed convention, not a naming
// choice made here.
// Never throws — same posture as proxyTrackingScript above.
export async function proxyTrackingSend(
  upstreamOrigin: string,
  body: string,
  forwardedHeaders: { contentType?: string; userAgent?: string; forwardedFor?: string },
): Promise<ProxiedSend> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${upstreamOrigin}/api/send`, {
      method: "POST",
      headers: {
        "content-type": forwardedHeaders.contentType ?? "application/json",
        ...(forwardedHeaders.userAgent ? { "user-agent": forwardedHeaders.userAgent } : {}),
        ...(forwardedHeaders.forwardedFor ? { "x-forwarded-for": forwardedHeaders.forwardedFor } : {}),
      },
      body,
      signal: controller.signal,
    });
    return {
      status: res.status,
      contentType: res.headers.get("content-type") ?? "application/json",
      body: await res.text(),
    };
  } catch {
    return { status: 504, contentType: "application/json", body: "{}" };
  } finally {
    clearTimeout(timeout);
  }
}
