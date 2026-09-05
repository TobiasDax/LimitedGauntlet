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

export interface ProxiedScript {
  status: number;
  contentType: string;
  body: ArrayBuffer;
}

export async function proxyTrackingScript(scriptUrl: string): Promise<ProxiedScript> {
  const res = await fetch(scriptUrl);
  return {
    status: res.status,
    contentType: res.headers.get("content-type") ?? "application/javascript",
    body: await res.arrayBuffer(),
  };
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
export async function proxyTrackingSend(
  upstreamOrigin: string,
  body: string,
  forwardedHeaders: { contentType?: string; userAgent?: string; forwardedFor?: string },
): Promise<ProxiedSend> {
  const res = await fetch(`${upstreamOrigin}/api/send`, {
    method: "POST",
    headers: {
      "content-type": forwardedHeaders.contentType ?? "application/json",
      ...(forwardedHeaders.userAgent ? { "user-agent": forwardedHeaders.userAgent } : {}),
      ...(forwardedHeaders.forwardedFor ? { "x-forwarded-for": forwardedHeaders.forwardedFor } : {}),
    },
    body,
  });
  return {
    status: res.status,
    contentType: res.headers.get("content-type") ?? "application/json",
    body: await res.text(),
  };
}
