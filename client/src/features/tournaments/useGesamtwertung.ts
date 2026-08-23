import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { GesamtwertungPod, GesamtwertungRow } from "../../lib/types";

export function useGesamtwertung(tournamentId: string | undefined) {
  return useQuery({
    queryKey: ["tournaments", tournamentId, "gesamtwertung"],
    queryFn: () => api.get<{ pods: GesamtwertungPod[]; gesamtwertung: GesamtwertungRow[] }>(
      `/tournaments/${tournamentId}/gesamtwertung`,
    ),
    enabled: !!tournamentId,
  });
}
