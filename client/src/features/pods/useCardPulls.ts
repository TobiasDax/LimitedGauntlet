import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { CardPull } from "../../lib/types";

export function usePodCardPulls(podId: string | undefined) {
  return useQuery({
    queryKey: ["pods", podId, "card-pulls"],
    queryFn: () => api.get<{ cardPulls: CardPull[]; total: number }>(`/pods/${podId}/card-pulls`),
    enabled: !!podId,
  });
}

export function useTournamentCardPulls(tournamentId: string | undefined) {
  return useQuery({
    queryKey: ["tournaments", tournamentId, "card-pulls"],
    queryFn: () => api.get<{ cardPulls: CardPull[]; total: number }>(`/tournaments/${tournamentId}/card-pulls`),
    enabled: !!tournamentId,
  });
}

export function useTreasureChest() {
  return useQuery({
    queryKey: ["card-pulls", "treasure-chest"],
    queryFn: () => api.get<{ cardPulls: CardPull[] }>("/card-pulls/treasure-chest"),
  });
}

export function useAutocompleteCard(query: string) {
  return useQuery({
    queryKey: ["scryfall", "autocomplete", query],
    queryFn: () => api.get<{ names: string[] }>(`/scryfall/autocomplete?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
  });
}

export function useAddCardPull(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cardName: string) => api.post<{ cardPull: CardPull }>(`/pods/${podId}/card-pulls`, { cardName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pods", podId, "card-pulls"] }),
  });
}

export function useDeleteCardPull(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pullId: string) => api.delete<void>(`/card-pulls/${pullId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pods", podId, "card-pulls"] }),
  });
}

export function cardPullErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.message === "card_not_found") {
    return "Couldn't find that card on Scryfall — check the spelling.";
  }
  return "Something went wrong.";
}
