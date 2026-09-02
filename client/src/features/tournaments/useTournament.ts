import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
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

// PI-68 — download a tournament's .xlsx. A file download, so it hits the
// endpoint directly rather than through the JSON `api` client (same approach
// as the org export in Settings).
export function useExportTournamentXlsx(tournamentId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/export.xlsx`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => undefined);
        throw new ApiError(res.status, body);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filename = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? "tournament.xlsx";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });
}

export const tournamentStatusLabel: Record<TournamentStatus, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  COMPLETED: "Completed",
};
