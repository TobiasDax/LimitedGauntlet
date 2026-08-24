import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface ApiTokenSummary {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export function useApiTokens() {
  return useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => api.get<{ apiTokens: ApiTokenSummary[] }>("/api-tokens"),
  });
}

export function useCreateApiToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.post<{ token: string; apiToken: ApiTokenSummary }>("/api-tokens", { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-tokens"] }),
  });
}

export function useRevokeApiToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api-tokens/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-tokens"] }),
  });
}
