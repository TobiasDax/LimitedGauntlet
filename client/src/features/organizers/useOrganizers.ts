import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

// Co-organizer management (PI-34). Roles are equal for v1 — an accepted
// invite creates a full OrganizerAccount, same access as anyone else.

export interface OrganizerSummary {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface OrganizerInviteSummary {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  invitedByName: string;
}

export function useOrganizers() {
  return useQuery({
    queryKey: ["organizers"],
    queryFn: () => api.get<{ organizers: OrganizerSummary[]; invites: OrganizerInviteSummary[] }>("/settings/organizers"),
  });
}

export function useInviteOrganizer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => api.post<{ link: string; emailSent: boolean }>("/settings/organizers/invite", { email }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizers"] }),
  });
}

export function useCancelInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/settings/organizers/invites/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizers"] }),
  });
}

export function useRemoveOrganizer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/settings/organizers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizers"] }),
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { currentPassword: string; confirmName: string }) =>
      api.post<void>("/settings/delete-organization", input),
    onSuccess: () => {
      queryClient.setQueryData(["me"], null);
      queryClient.clear();
    },
  });
}
