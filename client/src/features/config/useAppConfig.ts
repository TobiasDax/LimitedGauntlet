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
  legalLinkUrl: string | null;
  legalLinkLabel: string | null;
  // Configured SSO providers to show a button for (PI-42 / PI-43), in display
  // order. Empty array = password-only.
  ssoProviders?: SsoProvider[];
  // SSO-only mode: hide the local password form + signup link entirely.
  localLoginDisabled?: boolean;
  // null/undefined = analytics unconfigured on this deployment.
  tracking?: TrackingConfig | null;
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
