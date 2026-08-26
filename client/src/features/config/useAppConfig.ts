import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface AppConfig {
  legalLinkUrl: string | null;
  legalLinkLabel: string | null;
  // Optional SSO login (PI-42): whether it's configured, and the button label.
  oidcEnabled?: boolean;
  oidcProviderName?: string;
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
