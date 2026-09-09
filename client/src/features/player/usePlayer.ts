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

// PI-86 — switch which org's portal this player session is in. Full reload onto
// the new org's portal URL — the portal data is entirely org-scoped, same
// reasoning as the organizer useSwitchOrg.
export function usePlayerSwitchOrg() {
  return useMutation({
    mutationFn: (orgSlug: string) =>
      api.post<{ ok: true; organization: { slug: string; name: string } }>("/player/switch-org", { orgSlug }),
    onSuccess: (_data, orgSlug) => window.location.assign(`/o/${orgSlug}/player`),
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
    mutationFn: (input: { token: string; password: string }) => api.post<PlayerSession>("/player/accept-invite", input),
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

// PI-106 — a logged-in player corrects their own display name (GDPR Art. 16).
export function useRenameSelf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) =>
      api.patch<{ player: { id: string; displayName: string } }>("/player/me", { displayName }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["player", "me"] });
      void queryClient.invalidateQueries({ queryKey: ["player", "portal"] });
    },
  });
}

// PI-106 — ask the organizers to remove / anonymise this player (Art. 17 / 21).
// There's no self-executing erase — a human confirms it.
export function useRequestRemoval() {
  return useMutation({
    mutationFn: (message: string) =>
      api.post<{ ok: true; organizers: number; emailed: number }>("/player/removal-request", {
        message: message.trim() || undefined,
      }),
  });
}

// PI-105 — download the player's own data (Art. 15 / 20) as a JSON file.
export function useDownloadOwnData() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/player/export", { credentials: "include" });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => undefined);
        throw new ApiError(res.status, body);
      }
      const blob = await res.blob();
      const match = /filename="?([^"]+)"?/.exec(res.headers.get("Content-Disposition") ?? "");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = match?.[1] ?? "limited-gauntlet-my-data.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });
}
