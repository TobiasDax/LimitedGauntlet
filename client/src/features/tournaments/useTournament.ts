import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Pod, Tournament, TournamentStatus } from "../../lib/types";

export interface TournamentDetail extends Tournament {
  pods: Pod[];
  players: Array<{ tournamentId: string; playerId: string; player: { id: string; displayName: string } }>;
  // Distinct players who actually played at least one pod (PI-60/61
  // follow-up) — distinct from players.length, which is everyone
  // registered/attending regardless of whether they ever played.
  playersPlayed: number;
}

export function useTournament(id: string | undefined) {
  return useQuery({
    queryKey: ["tournaments", id],
    queryFn: () => api.get<{ tournament: TournamentDetail }>(`/tournaments/${id}`),
    enabled: !!id,
  });
}

export const tournamentStatusLabel: Record<TournamentStatus, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  COMPLETED: "Completed",
};
