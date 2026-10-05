import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { StandingBonusRow, Tournament, TournamentStatus } from "../../lib/types";
import { useMe } from "../auth/useAuth";
import type { TournamentDetail } from "./useTournament";

export function useTournaments() {
  return useQuery({
    queryKey: ["tournaments"],
    queryFn: () => api.get<{ tournaments: Tournament[] }>("/tournaments"),
  });
}

export interface CreateTournamentInput {
  name: string;
  startDate: string;
  endDate: string;
  location?: string;
  description?: string;
  // Hosted only: spend a bought pass on this tournament rather than the free slot.
  usePass?: boolean;
}

export function useCreateTournament() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTournamentInput) => api.post<{ tournament: Tournament }>("/tournaments", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      // Creating spends the free slot or a pass, which the plan UI reads from /me.
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export interface UpdateTournamentInput {
  name?: string;
  startDate?: string;
  endDate?: string;
  location?: string | null;
  description?: string | null;
  // PI-140 — organizer-only notes; null clears them.
  internalNotes?: string | null;
  status?: TournamentStatus;
  tokenParticipation?: number;
  tokenStandingBonuses?: StandingBonusRow[];
}

export function useUpdateTournament(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTournamentInput) => api.patch<{ tournament: Tournament }>(`/tournaments/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tournaments", id] });
      void queryClient.invalidateQueries({ queryKey: ["tournaments"] });
    },
  });
}

// PI-142 — autosave for the tournament's two Markdown text fields
// (description / internal notes). Deliberately NOT useUpdateTournament:
//
//   - It updates the detail cache *in place* instead of invalidating. A
//     refetch landing while the organizer is still typing would overwrite the
//     textarea; and with saves firing on blur + a slow debounce, invalidating
//     the whole tournament query each time would multiply requests against the
//     global 200/min/IP limit (worse behind a shared venue NAT).
//   - It retries, because there is no Save button to press again: a save that
//     fails on flaky venue wifi must not drop the text silently.
//
// The edit stamp is set from the current user (whom we know client-side)
// rather than re-fetched — the PATCH response is the bare row and doesn't
// carry the resolved editor name that only the GET route computes.
export function useAutosaveTournamentText(id: string) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const editorName = me?.identity?.name ?? me?.organizer?.name ?? null;

  return useMutation({
    mutationFn: (input: { field: "description" | "internalNotes"; value: string | null }) =>
      api.patch<{ tournament: Tournament }>(`/tournaments/${id}`, { [input.field]: input.value }),
    retry: 2,
    onSuccess: (_res, input) => {
      queryClient.setQueryData<{ tournament: TournamentDetail }>(["tournaments", id], (prev) => {
        if (!prev) return prev;
        const patch =
          input.field === "internalNotes"
            ? {
                internalNotes: input.value,
                internalNotesEditedAt: new Date().toISOString(),
                internalNotesEditedByName: editorName,
              }
            : { description: input.value };
        return { tournament: { ...prev.tournament, ...patch } };
      });
    },
  });
}

// PI-76 — bulk pod reorder: post the full desired pod order for a
// tournament; the server rewrites each pod's sequenceOrder to its index.
export function useReorderPods(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (podIds: string[]) => api.patch<{ ok: true }>(`/tournaments/${tournamentId}/pod-order`, { podIds }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tournaments", tournamentId] });
    },
  });
}

export function useDeleteTournament() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/tournaments/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tournaments"] });
    },
  });
}
