import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

// PI-112 — the built-in Impressum + privacy notice, assembled server-side from
// the deployment's LEGAL_* config (see server/src/legal/privacyPolicy.ts).
// `enabled: false` means LEGAL_PAGE_ENABLED=false — the /legal route then
// shows a short "not available here" message instead.
export interface LegalDoc {
  enabled: boolean;
  markdown: string;
  // controller name or email not configured — the page shows a warning banner.
  incomplete: boolean;
}

export function useLegalDoc() {
  return useQuery({
    queryKey: ["legal-doc"],
    queryFn: () => api.get<LegalDoc>("/legal"),
    staleTime: Infinity,
  });
}
