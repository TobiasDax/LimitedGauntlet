import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { LegalDoc } from "./useLegalDoc";

// HI-11 — the hosted instance's Terms of Service, assembled server-side
// (server/src/legal/terms.ts). `enabled: false` on every self-hosted install:
// nothing is sold there, so there are no terms to show.
export function useTermsDoc() {
  return useQuery({
    queryKey: ["terms-doc"],
    queryFn: () => api.get<LegalDoc>("/terms"),
    staleTime: Infinity,
  });
}
