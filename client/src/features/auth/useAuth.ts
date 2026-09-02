import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { Organizer, Organization } from "../../lib/types";

interface MeResponse {
  organizer: Organizer;
  organization: Organization;
  // Whether this org's public pages are behind a password (PI-27). Optional
  // because the login/signup responses don't compute it; /auth/me always does.
  publicLockEnabled?: boolean;
  // Whether the tokens feature (PI-72) is enabled for this org. Same optionality
  // as publicLockEnabled — only /auth/me sets it.
  tokensEnabled?: boolean;
  // How many organizers this org has (PI-34) — drives Settings' "delete my
  // account" vs "leave organization" wording. Always present in practice
  // (every response that sets this cache includes it); optional here only so
  // reads don't need a non-null assertion before the first load.
  organizerCount?: number;
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

// Tokens opt-in (PI-72). Patches the `me` cache and invalidates the player
// pages, whose token surfaces appear/disappear with the flag.
export function useToggleTokens() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => api.put<{ tokensEnabled: boolean }>("/settings/tokens", { enabled }),
    onSuccess: (_data, enabled) => {
      queryClient.setQueryData<MeResponse | null>(["me"], (prev) => (prev ? { ...prev, tokensEnabled: enabled } : prev));
      queryClient.invalidateQueries({ queryKey: ["hall-of-fame"] });
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
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

// Confirm a conflicting OIDC-subject relink (PI-49). Public, token-gated —
// confirming rotates the account's authVersion and revokes existing sessions
// (including whatever session confirmed it), so refresh "me" rather than
// assume this browser is still logged in.
export function useConfirmOidcRelink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.post<{ ok: true }>("/auth/oidc/relink", { token }),
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

// Co-organizer invites (PI-34). Both public — the token in the link is the
// proof, so these work even for someone with no account yet.
export function useInviteInfo(token: string) {
  return useQuery({
    queryKey: ["invite", token],
    queryFn: () => api.get<{ email: string; organizationName: string }>(`/auth/invite/${token}`),
    enabled: !!token,
    retry: false,
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { token: string; name: string; password: string }) =>
      api.post<MeResponse>("/auth/accept-invite", input),
    onSuccess: (data) => {
      // Same reasoning as useLogin: set the cache synchronously so the new
      // organizer is authenticated the instant they're redirected.
      queryClient.setQueryData<MeResponse>(["me"], data);
    },
  });
}

// OIDC self-registration (PI-42). After a first SSO login with no existing
// account, the org-setup screen reads the pending identity and completes it.
export function useOidcPending() {
  return useQuery({
    queryKey: ["oidc-pending"],
    queryFn: async () => {
      try {
        return await api.get<{ email: string; suggestedName: string }>("/auth/oidc/pending");
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    retry: false,
  });
}

export function useCompleteOidcRegistration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { orgName: string; orgSlug: string; organizerName: string }) =>
      api.post<MeResponse>("/auth/oidc/complete-registration", input),
    onSuccess: (data) => {
      queryClient.setQueryData<MeResponse>(["me"], data);
    },
  });
}
