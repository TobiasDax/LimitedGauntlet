import type { TrackingConfig } from "../features/config/useAppConfig";

// Client-side half of the PI-85 provider registry (server half:
// server/src/trackingProviders.ts). Turns an already-validated tracking
// config into a real <script> element. Adding a second provider later is one
// case here — no changes needed to TrackingScript.tsx, which just calls this.
//
// Every value is set via DOM properties/setAttribute, never innerHTML or
// string-built markup, so there's no interpolation step for a TRACKING_* env
// var to escape out of.
export function buildTrackingScript(tracking: TrackingConfig): HTMLScriptElement {
  const script = document.createElement("script");
  script.defer = true;
  switch (tracking.provider) {
    case "umami":
      script.src = tracking.scriptUrl;
      script.setAttribute("data-website-id", tracking.code);
      break;
  }
  return script;
}
