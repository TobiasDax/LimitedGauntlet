import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Tournament } from "../../lib/types";

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
