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

// Bulk add for individual pods (PI-64/65): a checklist of existing roster
// players plus any brand-new names to create on the roster and add at once.
export function useAddEntrantsBulk(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { playerIds?: string[]; newPlayerNames?: string[] }) =>
      api.post<{ entrants: Entrant[] }>(`/pods/${podId}/entrants`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pods", podId] });
      // New players land on the org roster too.
      queryClient.invalidateQueries({ queryKey: ["players"] });
    },
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

// Drop/undrop (PI-63) — only allowed between rounds; see the server route
// comment on POST /api/entrants/:id/drop for why.
export function useDropEntrant(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entrantId: string) => api.post<{ entrant: Entrant }>(`/entrants/${entrantId}/drop`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pods", podId] }),
  });
}

export function useUndropEntrant(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entrantId: string) => api.post<{ entrant: Entrant }>(`/entrants/${entrantId}/undrop`),
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
    if (err.message === "round_in_progress") return "Finish the current round before changing who's dropped.";
    if (err.message === "already_dropped" || err.message === "not_dropped") return "That entrant's drop status just changed — reload and try again.";
    if (err.message === "name_taken") {
      const name = typeof err.body === "object" && err.body && "name" in err.body ? String((err.body as { name: unknown }).name) : null;
      return name
        ? `A player named "${name}" already exists — tick them in the list instead of adding a new one.`
        : "That name is already on the roster.";
    }
    if (err.message === "unknown_player" || err.message === "player_not_found") return "Unknown player — reload and try again.";
    if (err.status === 409) return "Already entered in this pod.";
  }
  return "Something went wrong.";
}
