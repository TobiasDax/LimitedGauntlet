import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { Organizer, Organization } from "../../lib/types";

export interface OrgSummary {
  id: string;
  slug: string;
  name: string;
}

export interface MeResponse {
  // PI-86 — the login itself, org-independent (only /auth/me + auth responses set it).
  identity?: { id: string; email: string; name: string; hasPassword: boolean };
  // Every org this login belongs to (PI-86). Empty = a membership-less account.
  organizations?: OrgSummary[];
  // The org currently in context. null = no active org → ProtectedRoute sends
  // the user to the org chooser (/organizations), so any component rendered
  // *inside* a protected route can rely on organizer/organization being set.
  activeOrgId?: string | null;

  organizer: Organizer;
  organization: Organization;
  // Whether this org's public pages are behind a password (PI-27). Optional
  // because the login/signup responses don't compute it; /auth/me always does.
  publicLockEnabled?: boolean;
  // Whether the tokens feature (PI-72) is enabled for this org.
  tokensEnabled?: boolean;
  // How many organizers this org has (PI-34) — drives Settings' "delete my
  // account" vs "leave organization" wording.
  organizerCount?: number;
  // Whether this account has ever set a local password (PI-42). false = SSO
  // only. Drives the Profile page. Treat undefined as "has one".
  hasPassword?: boolean;
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
    mutationFn: (input: SignupInput) => api.post<MeResponse>("/auth/signup", input),
    onSuccess: (data) => queryClient.setQueryData(["me"], data),
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
    onSuccess: (data) => {
      // Set the cache synchronously rather than invalidating — an invalidated
      // query still shows its previous (null) data until the background
      // refetch resolves, and ProtectedRoute reads that stale null in the gap.
      // PI-86: `data` may have activeOrgId=null (multi-org account with no
      // resumable org, or a membership-less one) — ProtectedRoute then routes
      // to /organizations.
      queryClient.setQueryData(["me"], data);
    },
  });
}

// PI-86 — switch the active org. Every page's data is org-scoped, so rather
// than chase down each cache the cleanest correct thing is a full reload onto
// the dashboard — org switching is rare and the whole tenant context changes.
export function useSwitchOrg() {
  return useMutation({
    mutationFn: (orgId: string) => api.post<{ ok: true; activeOrgId: string }>("/auth/switch-org", { orgId }),
    onSuccess: () => window.location.assign("/"),
  });
}

// PI-86 — an existing organizer creates another org for themselves (adds a
// membership, not a new account). Distinct from useSignup. Full reload for the
// same reason as useSwitchOrg — you land in a fresh, empty tenant.
export function useCreateOrganization() {
  return useMutation({
    mutationFn: (input: { orgName: string; orgSlug: string }) => api.post<MeResponse>("/auth/organizations", input),
    onSuccess: () => window.location.assign("/"),
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
      queryClient.setQueryData<MeResponse | null>(["me"], (prev) =>
        prev ? { ...prev, tokensEnabled: enabled } : prev,
      );
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

// Account management (PI-28). currentPassword is optional — an SSO-only
// account (PI-42) omits it (setting a first password, or re-confirming a
// destructive action via the typed name alone).
export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { currentPassword?: string; newPassword: string }) =>
      api.post<{ ok: true }>("/settings/password", input),
    onSuccess: () => {
      // An SSO-only account just set its first password — flip the cached
      // flag (both places it lives) so Profile switches to password mode.
      queryClient.setQueryData<MeResponse | null>(["me"], (prev) =>
        prev
          ? {
              ...prev,
              hasPassword: true,
              identity: prev.identity ? { ...prev.identity, hasPassword: true } : prev.identity,
            }
          : prev,
      );
    },
  });
}

export function useRequestEmailChange() {
  return useMutation({
    mutationFn: (input: { currentPassword?: string; newEmail: string }) =>
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

// PI-86 — "leave org" (co-organizers remain) returns { left: true } and the
// session stays alive; a solo delete returns 204 and logs out. Either way we
// clear caches; the caller routes on `left`.
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { currentPassword?: string; confirmName: string }) =>
      api.post<{ left?: boolean } | null>("/settings/delete-account", input),
    onSuccess: (data) => {
      queryClient.clear();
      if (!data?.left) queryClient.setQueryData(["me"], null);
    },
  });
}

// Co-organizer invites (PI-34). Both public — the token in the link is the
// proof, so these work even for someone with no account yet.
export function useInviteInfo(token: string) {
  return useQuery({
    queryKey: ["invite", token],
    queryFn: () =>
      api.get<{ email: string; organizationName: string; accountExists: boolean }>(`/auth/invite/${token}`),
    enabled: !!token,
    retry: false,
  });
}

// PI-86 — `name`/`password` only for the not-logged-in path. When already
// signed in as the invited identity, accepting just adds a membership.
export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { token: string; name?: string; password?: string }) =>
      api.post<MeResponse>("/auth/accept-invite", input),
    onSuccess: (data) => {
      queryClient.clear();
      queryClient.setQueryData(["me"], data);
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
      queryClient.setQueryData(["me"], data);
    },
  });
}
