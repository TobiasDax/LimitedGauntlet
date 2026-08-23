import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { Organizer, Organization } from "../../lib/types";

interface MeResponse {
  organizer: Organizer;
  organization: Organization;
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
    mutationFn: (input: LoginInput) => api.post<{ organizer: Organizer }>("/auth/login", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
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
