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

// PI-52 — invite a roster player to a self-service account, or revoke one.
export function useInvitePlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) =>
      api.post<{ acceptUrl: string; emailSent: boolean }>(`/players/${id}/invite`, { email }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["players"] }),
  });
}

export function useRevokePlayerAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/players/${id}/account`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["players"] }),
  });
}
