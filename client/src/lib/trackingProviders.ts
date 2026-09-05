import type { TrackingConfig } from "../features/config/useAppConfig";

// Client-side half of the PI-85 provider registry (server half:
// server/src/trackingProviders.ts). Turns an already-validated tracking
// config into a real <script> element. Adding a second provider later is one
// case here — no changes needed to TrackingScript.tsx, which just calls this.
//
// Every value is set via DOM properties/setAttribute, never innerHTML or
// string-built markup, so there's no interpolation step for a TRACKING_* env
// var to escape out of.
//
// Points at this app's own /stats.js, not the deployer's real
// TRACKING_SCRIPT_URL — routes/tracking.ts proxies that same-origin (the
// browser never learns the actual analytics host), which is also why
// TrackingConfig no longer carries scriptUrl at all; see that route + the
// CSP comment in server/src/index.ts for why.
export function buildTrackingScript(tracking: TrackingConfig): HTMLScriptElement {
  const script = document.createElement("script");
  script.defer = true;
  switch (tracking.provider) {
    case "umami":
      script.src = "/stats.js";
      script.setAttribute("data-website-id", tracking.code);
      break;
  }
  return script;
}
