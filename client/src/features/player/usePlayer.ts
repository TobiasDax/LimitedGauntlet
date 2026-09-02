import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { PlayerPortalMatch, PlayerPortalTournament, PlayerSession } from "../../lib/types";

// The self-service player portal (PI-52). Its own auth surface and query
// namespace (["player", ...]), entirely separate from the organizer's ["me"].

export function usePlayerMe() {
  return useQuery<PlayerSession | null>({
    queryKey: ["player", "me"],
    queryFn: async () => {
      try {
        return await api.get<PlayerSession>("/player/me");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
  });
}

export function usePlayerLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { orgSlug: string; email: string; password: string }) =>
      api.post<PlayerSession>("/player/login", input),
    onSuccess: (data) => queryClient.setQueryData<PlayerSession>(["player", "me"], data),
  });
}

export function usePlayerLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/player/logout"),
    onSuccess: () => {
      queryClient.setQueryData(["player", "me"], null);
      queryClient.removeQueries({ queryKey: ["player", "portal"] });
    },
  });
}

export function usePlayerInviteInfo(token: string) {
  return useQuery({
    queryKey: ["player", "invite", token],
    queryFn: () =>
      api.get<{ email: string; playerName: string; organizationName: string; orgSlug: string }>(
        `/player/invite/${token}`,
      ),
    enabled: !!token,
    retry: false,
  });
}

export function useAcceptPlayerInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      api.post<PlayerSession>("/player/accept-invite", input),
    onSuccess: (data) => queryClient.setQueryData<PlayerSession>(["player", "me"], data),
  });
}

interface PortalResponse {
  tournaments: PlayerPortalTournament[];
  matches: PlayerPortalMatch[];
}

export function usePlayerPortal(enabled: boolean) {
  return useQuery<PortalResponse | null>({
    queryKey: ["player", "portal"],
    queryFn: async () => {
      try {
        return await api.get<PortalResponse>("/player/portal");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    enabled,
    retry: false,
  });
}

export function useCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tournamentId, checkedIn }: { tournamentId: string; checkedIn: boolean }) =>
      checkedIn
        ? api.delete<void>(`/player/tournaments/${tournamentId}/check-in`)
        : api.post<void>(`/player/tournaments/${tournamentId}/check-in`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["player", "portal"] }),
  });
}

export function useSubmitPlayerResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ matchId, gamesWonA, gamesWonB }: { matchId: string; gamesWonA: number; gamesWonB: number }) =>
      api.patch<{ match: unknown }>(`/player/matches/${matchId}/result`, { gamesWonA, gamesWonB }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["player", "portal"] }),
  });
}
