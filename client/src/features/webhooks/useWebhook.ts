import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface WebhookConfig {
  url: string | null;
  secret: string | null;
}

export interface WebhookTestResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export function useWebhookConfig() {
  return useQuery({
    queryKey: ["settings", "webhook"],
    queryFn: () => api.get<WebhookConfig>("/settings/webhook"),
  });
}

export function useSetWebhookUrl() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url: string | null) => api.put<WebhookConfig>("/settings/webhook", { url }),
    onSuccess: (data) => queryClient.setQueryData<WebhookConfig>(["settings", "webhook"], data),
  });
}

export function useRegenerateWebhookSecret() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<WebhookConfig>("/settings/webhook/regenerate-secret"),
    onSuccess: (data) => queryClient.setQueryData<WebhookConfig>(["settings", "webhook"], data),
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: () => api.post<WebhookTestResult>("/settings/webhook/test"),
  });
}
