import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { TokenLedger } from "../../lib/types";

// PI-72 — organizer view of a player's token ledger + manual adjustments.
export function useTokenLedger(playerId: string | undefined, enabled = true) {
  return useQuery<TokenLedger | null>({
    queryKey: ["tokens", "ledger", playerId],
    queryFn: async () => {
      try {
        return await api.get<TokenLedger>(`/players/${playerId}/token-ledger`);
      } catch (err) {
        // 404 = org has tokens off (or unknown player) — caller renders nothing.
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: !!playerId && enabled,
    retry: false,
  });
}

export function useAdjustTokens(playerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { delta?: number; setTo?: number; note?: string }) =>
      api.post<{ balance: number }>(`/players/${playerId}/token-adjust`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tokens", "ledger", playerId] });
      queryClient.invalidateQueries({ queryKey: ["hall-of-fame", "players", playerId] });
    },
  });
}

// The logged-in player's own ledger, in the PI-52 portal.
export function usePlayerPortalTokens() {
  return useQuery<TokenLedger | null>({
    queryKey: ["player", "tokens"],
    queryFn: async () => {
      try {
        return await api.get<TokenLedger>("/player/tokens");
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    retry: false,
  });
}
