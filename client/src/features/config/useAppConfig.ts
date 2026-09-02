import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface SsoProvider {
  id: "oidc" | "google" | "discord";
  label: string;
}

export interface AppConfig {
  legalLinkUrl: string | null;
  legalLinkLabel: string | null;
  // Configured SSO providers to show a button for (PI-42 / PI-43), in display
  // order. Empty array = password-only.
  ssoProviders?: SsoProvider[];
  // SSO-only mode: hide the local password form + signup link entirely.
  localLoginDisabled?: boolean;
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
