import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { StandingBonusRow, Tournament, TournamentStatus } from "../../lib/types";

export function useTournaments() {
  return useQuery({
    queryKey: ["tournaments"],
    queryFn: () => api.get<{ tournaments: Tournament[] }>("/tournaments"),
  });
}

export interface CreateTournamentInput {
  name: string;
  startDate: string;
  endDate: string;
  location?: string;
  description?: string;
}

export function useCreateTournament() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTournamentInput) => api.post<{ tournament: Tournament }>("/tournaments", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
    },
  });
}

export interface UpdateTournamentInput {
  name?: string;
  startDate?: string;
  endDate?: string;
  location?: string | null;
  description?: string | null;
  status?: TournamentStatus;
  tokenParticipation?: number;
  tokenStandingBonuses?: StandingBonusRow[];
}

export function useUpdateTournament(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTournamentInput) => api.patch<{ tournament: Tournament }>(`/tournaments/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournaments", id] });
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
    },
  });
}

// PI-76 — bulk pod reorder: post the full desired pod order for a
// tournament; the server rewrites each pod's sequenceOrder to its index.
export function useReorderPods(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (podIds: string[]) =>
      api.patch<{ ok: true }>(`/tournaments/${tournamentId}/pod-order`, { podIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournaments", tournamentId] });
    },
  });
}

export function useDeleteTournament() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/tournaments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
    },
  });
}
