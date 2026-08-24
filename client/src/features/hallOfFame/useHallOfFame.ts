import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type {
  HallOfFameBiggestPull,
  HallOfFameHeadline,
  HallOfFameRow,
  MostPlayedPairing,
  PlayerStatsDetail,
} from "../../lib/types";

export interface HallOfFameOverviewResponse {
  hallOfFame: HallOfFameRow[];
  headline: HallOfFameHeadline;
  mostPlayedPairings: MostPlayedPairing[];
  biggestPulls: HallOfFameBiggestPull[];
}

// All-time player standings across every tournament in the org, plus
// headline stats, most-played pairings, and the biggest pulls.
export function useHallOfFame() {
  return useQuery({
    queryKey: ["hall-of-fame"],
    queryFn: () => api.get<HallOfFameOverviewResponse>("/hall-of-fame"),
  });
}

export function usePlayerStats(playerId: string | undefined) {
  return useQuery({
    queryKey: ["hall-of-fame", "players", playerId],
    queryFn: () => api.get<{ stats: PlayerStatsDetail }>(`/hall-of-fame/players/${playerId}`),
    enabled: !!playerId,
  });
}
