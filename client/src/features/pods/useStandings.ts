import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { StandingsRow } from "../../lib/types";

export function useStandings(podId: string | undefined) {
  return useQuery({
    queryKey: ["pods", podId, "standings"],
    queryFn: () => api.get<{ standings: StandingsRow[] }>(`/pods/${podId}/standings`),
    enabled: !!podId,
  });
}
