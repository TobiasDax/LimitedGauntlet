import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { Organizer, Organization } from "../../lib/types";

interface MeResponse {
  organizer: Organizer;
  organization: Organization;
  // Whether this org's public pages are behind a password (PI-27). Optional
  // because the login/signup responses don't compute it; /auth/me always does.
  publicLockEnabled?: boolean;
}

export function useMe() {
  return useQuery<MeResponse | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.get<MeResponse>("/auth/me");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
  });
}

// Public — checked before the user is authenticated, to show a clear
// "closed" message instead of a dead-end form.
export function useSignupStatus() {
  return useQuery({
    queryKey: ["signup-status"],
    queryFn: () => api.get<{ allowSignup: boolean }>("/auth/signup-status"),
  });
}

export interface SignupInput {
  orgName: string;
  orgSlug: string;
  organizerName: string;
  organizerEmail: string;
  organizerPassword: string;
}

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SignupInput) => api.post<{ organizer: Organizer; organization: Organization }>("/auth/signup", input),
    onSuccess: ({ organizer, organization }) => {
      queryClient.setQueryData<MeResponse>(["me"], { organizer, organization });
    },
  });
}

export interface LoginInput {
  email: string;
  password: string;
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<MeResponse>("/auth/login", input),
    onSuccess: ({ organizer, organization }) => {
      // Set the cache synchronously rather than invalidating — an
      // invalidated query still shows its previous (unauthenticated,
      // null) data until the background refetch resolves, and
      // ProtectedRoute reads that stale null in the gap and bounces
      // straight back to /login before the real session ever lands.
      queryClient.setQueryData<MeResponse>(["me"], { organizer, organization });
    },
  });
}

// Public-page password lock (PI-27). Both mutations patch the `me` cache's
// publicLockEnabled directly so the Settings UI reflects the new state instantly.
export function useSetPublicLock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => api.put<{ publicLockEnabled: boolean }>("/settings/public-lock", { password }),
    onSuccess: () => {
      queryClient.setQueryData<MeResponse | null>(["me"], (prev) =>
        prev ? { ...prev, publicLockEnabled: true } : prev,
      );
    },
  });
}

export function useClearPublicLock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ publicLockEnabled: boolean }>("/settings/public-lock"),
    onSuccess: () => {
      queryClient.setQueryData<MeResponse | null>(["me"], (prev) =>
        prev ? { ...prev, publicLockEnabled: false } : prev,
      );
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/auth/logout"),
    onSuccess: () => {
      queryClient.setQueryData(["me"], null);
      queryClient.clear();
    },
  });
}

// Account management (PI-28).
export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      api.post<{ ok: true }>("/settings/password", input),
  });
}

export function useRequestEmailChange() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newEmail: string }) =>
      api.post<{ ok: true }>("/settings/email", input),
  });
}

export function useVerifyEmailChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.post<{ ok: true; email: string }>("/auth/verify-email-change", { token }),
    // If the confirming browser is also logged in, refresh its cached email.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { currentPassword: string; confirmName: string }) =>
      api.post<void>("/settings/delete-account", input),
    onSuccess: () => {
      queryClient.setQueryData(["me"], null);
      queryClient.clear();
    },
  });
}
