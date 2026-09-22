import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface SsoProvider {
  id: "oidc" | "google" | "discord";
  label: string;
}

// Deployer-configured web analytics (PI-85). Already validated server-side
// (trackingProviders.ts) before this ever reaches the client. No scriptUrl
// here on purpose — the real analytics host is proxied same-origin
// (routes/tracking.ts) and never sent to the browser.
export interface TrackingConfig {
  provider: "umami";
  code: string;
}

export interface AppConfig {
  // PI-116 — the running app version, e.g. "0.15.0". Footer links it to
  // that version's GitHub release page.
  appVersion?: string;
  legalLinkUrl: string | null;
  legalLinkLabel: string | null;
  // PI-112 — whether the built-in /legal page (Impressum + privacy notice) is
  // served. The footer links it when true; the content comes from GET /api/legal.
  legalPageEnabled?: boolean;
  // Configured SSO providers to show a button for (PI-42 / PI-43), in display
  // order. Empty array = password-only.
  ssoProviders?: SsoProvider[];
  // SSO-only mode: hide the local password form + signup link entirely.
  localLoginDisabled?: boolean;
  // null/undefined = analytics unconfigured on this deployment.
  tracking?: TrackingConfig | null;
  // HI-9 — true only on a deployment running hosted tiers. Every tier, quota
  // and upgrade affordance in the UI hangs off this: a self-hosted install
  // (the default, and the overwhelmingly common case) leaves it false and
  // shows none of it, because it is running the complete app with nothing to
  // buy. Treat a missing value as false.
  hostedEntitlements?: boolean;
  // Contact for things only the operator can do, e.g. changing tournament
  // dates the hosted tiers lock. Null unless hostedEntitlements is true.
  supportEmail?: string | null;
}

// Public, no-auth config the frontend chrome needs on every page (incl.
// public /o/:slug/... pages) — currently just the optional footer legal
// link (PI-35). Static per-deployment, so it never needs invalidating.
export function useAppConfig() {
  return useQuery({
    queryKey: ["app-config"],
    queryFn: () => api.get<AppConfig>("/app-config"),
    staleTime: Infinity,
  });
}
