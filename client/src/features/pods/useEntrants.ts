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

export function entrantErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return "Already entered in this pod.";
    if (err.message === "player_not_found") return "Unknown player.";
  }
  return "Something went wrong.";
}
