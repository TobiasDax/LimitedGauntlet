import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { Pod, Tournament, TournamentStatus } from "../../lib/types";

export interface TournamentDetail extends Tournament {
  pods: Pod[];
  players: Array<{ tournamentId: string; playerId: string; player: { id: string; displayName: string } }>;
  // Distinct players who actually played at least one pod (PI-60/61
  // follow-up) — distinct from players.length, which is everyone
  // registered/attending regardless of whether they ever played.
  playersPlayed: number;
  // HI-9 — which entitlement covers this tournament on a hosted instance:
  // "FREE" (the lifetime slot), "TOURNAMENT_PASS", or null (not set — an
  // active SERIES org, or self-hosted). Drives the "use a pass" control.
  coveringEntitlement?: "FREE" | "TOURNAMENT_PASS" | "SERIES" | null;
}

export function useTournament(id: string | undefined) {
  return useQuery({
    queryKey: ["tournaments", id],
    queryFn: () => api.get<{ tournament: TournamentDetail }>(`/tournaments/${id}`),
    enabled: !!id,
  });
}

// HI-9 rule 3 — spend a banked pass on this (free-covered) tournament,
// reclaiming the free slot. Refreshes the tournament (coverage changes) and
// `me` (one fewer unused pass, free slot returned).
export function useApplyPass(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/tournaments/${id}/apply-pass`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tournaments", id] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
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
        const body: unknown = await res.json().catch(() => undefined);
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
