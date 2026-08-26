import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface OrgWebhook {
  id: string;
  url: string;
  secret: string;
  label: string | null;
  createdAt: string;
}

export interface WebhookTestResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export function useWebhooks() {
  return useQuery({
    queryKey: ["settings", "webhooks"],
    queryFn: () => api.get<{ webhooks: OrgWebhook[] }>("/settings/webhooks"),
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { url: string; label?: string }) =>
      api.post<{ webhook: OrgWebhook }>("/settings/webhooks", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "webhooks"] }),
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/settings/webhooks/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "webhooks"] }),
  });
}

export function useRegenerateWebhookSecret() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ webhook: OrgWebhook }>(`/settings/webhooks/${id}/regenerate-secret`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "webhooks"] }),
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: (id: string) => api.post<WebhookTestResult>(`/settings/webhooks/${id}/test`),
  });
}
