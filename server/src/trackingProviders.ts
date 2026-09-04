// PI-85: deployer-configured web analytics (Umami first). Provider registry
// + config parsing live together here so adding a second provider later is
// one registry entry + widening the TrackingProviderId union — nothing else
// (CSP wiring, /api/app-config, the frontend injector) needs to change.
//
// TRACKING_PROVIDER / TRACKING_SCRIPT_URL / TRACKING_CODE are never trusted
// as HTML/script — they're validated strictly here (the only gate), and the
// client only ever turns a validated config into a <script> element via DOM
// properties (see client/src/lib/trackingProviders.ts), never string/innerHTML
// interpolation.

export type TrackingProviderId = "umami";

export interface TrackingConfig {
  provider: TrackingProviderId;
  scriptUrl: string;
  code: string;
}

const providerIds: TrackingProviderId[] = ["umami"];

// Pattern each provider's site id/token must match — Umami's website id is a
// UUID. Widen this map alongside providerIds when a second provider is added.
const codePatterns: Record<TrackingProviderId, RegExp> = {
  umami: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
};

function isTrackingProviderId(value: string): value is TrackingProviderId {
  return (providerIds as string[]).includes(value);
}

// Pure so it's unit-testable without touching real env vars — mirrors
// parseTrustedProxies's shape in proxyTrust.ts. Unset TRACKING_PROVIDER means
// the feature is fully inert (same "off by default" posture as SMTP/OIDC/
// webhooks/LEGAL_LINK_URL). Any other misconfiguration throws clearly at
// startup rather than silently degrading — a half-configured tracking script
// fails invisibly at runtime (a blocked CSP request shows nothing in the UI),
// so it's better to refuse to start than to guess.
export function parseTrackingConfig(env: {
  provider?: string;
  scriptUrl?: string;
  code?: string;
}): TrackingConfig | null {
  const providerRaw = env.provider?.trim();
  if (!providerRaw) return null;

  if (!isTrackingProviderId(providerRaw)) {
    throw new Error(`Invalid TRACKING_PROVIDER: "${providerRaw}" (must be one of: ${providerIds.join(", ")})`);
  }

  const scriptUrlRaw = env.scriptUrl?.trim() ?? "";
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(scriptUrlRaw);
  } catch {
    throw new Error(`TRACKING_SCRIPT_URL must be a valid absolute URL (got: "${scriptUrlRaw}")`);
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error(`TRACKING_SCRIPT_URL must use https:// (got: "${scriptUrlRaw}")`);
  }

  const code = env.code?.trim() ?? "";
  if (!codePatterns[providerRaw].test(code)) {
    throw new Error(`TRACKING_CODE is not a valid ${providerRaw} site id`);
  }

  return { provider: providerRaw, scriptUrl: parsedUrl.toString(), code };
}
