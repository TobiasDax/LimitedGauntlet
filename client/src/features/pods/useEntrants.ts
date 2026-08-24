import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { Entrant } from "../../lib/types";

export function useAddIndividualEntrant(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (playerId: string) => api.post<{ entrant: Entrant }>(`/pods/${podId}/entrants`, { playerId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pods", podId] }),
  });
}

export function useAddTeamEntrant(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { teamName: string; playerIds: string[] }) =>
      api.post<{ entrant: Entrant }>(`/pods/${podId}/entrants`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pods", podId] }),
  });
}

export function useRemoveEntrant(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entrantId: string) => api.delete<void>(`/entrants/${entrantId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pods", podId] }),
  });
}

// Sets or clears an entrant's manual tiebreak order — only ever compared
// against entrants tied on points (see the Entrant.manualTiebreak schema
// comment for why this exists). Invalidates standings specifically since
// that's the only place this value is read.
export function useSetManualTiebreak(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entrantId, manualTiebreak }: { entrantId: string; manualTiebreak: number | null }) =>
      api.patch<{ entrant: Entrant }>(`/entrants/${entrantId}`, { manualTiebreak }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pods", podId, "standings"] }),
  });
}

export function entrantErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return "Already entered in this pod.";
    if (err.message === "player_not_found") return "Unknown player.";
  }
  return "Something went wrong.";
}
