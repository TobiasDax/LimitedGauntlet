import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
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

// PI-104 — anonymise a roster entry (GDPR Art. 17 erasure that keeps the
// competitive record intact). Irreversible.
export function useAnonymisePlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ player: Player }>(`/players/${id}/anonymise`),
    // Anonymising rewrites a name that appears in standings / Hall of Fame /
    // pod history everywhere, so refetch broadly rather than guess keys.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

// PI-107 — hide/show a player on the public pages (GDPR Art. 21 objection).
export function useSetPlayerPublicHidden() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) =>
      api.post<{ player: Player }>(`/players/${id}/public-visibility`, { hidden }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["players"] }),
  });
}

// PI-105 — download one player's own data (GDPR Art. 15 / 20) as a JSON file.
// A file download, so it bypasses the JSON-parsing `api` client (same pattern
// as the org export in useDataTransfer.ts).
export function useDownloadPlayerData() {
  return useMutation({
    mutationFn: async ({ id }: { id: string; name: string }) => {
      const res = await fetch(`/api/players/${id}/export`, { credentials: "include" });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => undefined);
        throw new ApiError(res.status, body);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = match?.[1] ?? "limited-gauntlet-player-data.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });
}
