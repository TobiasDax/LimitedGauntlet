import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Player } from "../../lib/types";

export function usePlayers() {
  return useQuery({
    queryKey: ["players"],
    queryFn: () => api.get<{ players: Player[] }>("/players"),
  });
}

export function useCreatePlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) => api.post<{ player: Player }>("/players", { displayName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["players"] }),
  });
}

export function useUpdatePlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, displayName }: { id: string; displayName: string }) =>
      api.patch<{ player: Player }>(`/players/${id}`, { displayName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["players"] }),
  });
}

export function useDeletePlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/players/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["players"] }),
  });
}
