import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { ConstructedFormat, Entrant, MatchFormat, Pod, PodFormat } from "../../lib/types";

export interface PodDetail extends Pod {
  entrants: Entrant[];
}

export function usePod(id: string | undefined) {
  return useQuery({
    queryKey: ["pods", id],
    queryFn: () => api.get<{ pod: PodDetail }>(`/pods/${id}`),
    enabled: !!id,
  });
}

export interface CreatePodInput {
  name: string;
  format: PodFormat;
  sequenceOrder: number;
  date?: string;
  isTeamEvent: boolean;
  teamSize?: number;
  roundCount: number;
  matchFormat: MatchFormat;
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  roundLengthMinutes: number;
  isMainEvent?: boolean;
  setCode?: string;
  constructedFormat?: ConstructedFormat;
  constructedFormatCustom?: string;
}

export function useCreatePod(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePodInput) => api.post<{ pod: Pod }>(`/tournaments/${tournamentId}/pods`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournaments", tournamentId] });
    },
  });
}

export interface UpdatePodInput {
  name?: string;
  date?: string;
  format?: PodFormat;
  isTeamEvent?: boolean;
  teamSize?: number;
  roundCount?: number;
  matchFormat?: MatchFormat;
  pointsWin?: number;
  pointsDraw?: number;
  pointsLoss?: number;
  roundLengthMinutes?: number;
  excludeFromStats?: boolean;
  isMainEvent?: boolean;
  setCode?: string | null;
  constructedFormat?: ConstructedFormat | null;
  constructedFormatCustom?: string | null;
}

export function useUpdatePod(podId: string, tournamentId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePodInput) => api.patch<{ pod: Pod }>(`/pods/${podId}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pods", podId] });
      if (tournamentId) queryClient.invalidateQueries({ queryKey: ["tournaments", tournamentId] });
    },
  });
}

export function useDeletePod(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (podId: string) => api.delete<void>(`/pods/${podId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournaments", tournamentId] });
    },
  });
}

// Standalone pre-round timer (PI-33): draft / deck-building time before any
// round is paired. Both mutations rely on the pod's realtime broadcast
// ("prep-timer-updated") to refresh every viewer; the local invalidate keeps
// the organizer's own tab instant even if the socket round-trips slowly.
export function useSetPrepTimer(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { minutes: number; label?: string }) =>
      api.post<{ pod: Pod }>(`/pods/${podId}/prep-timer`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pods", podId] }),
  });
}

export function useClearPrepTimer(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>(`/pods/${podId}/prep-timer`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pods", podId] }),
  });
}

export const podFormatLabel: Record<PodFormat, string> = {
  DRAFT: "Draft",
  SEALED: "Sealed",
  CHAOS_DRAFT: "Chaos Draft",
  CONSTRUCTED: "Constructed",
  CUSTOM: "Custom",
};

export const constructedFormatLabel: Record<ConstructedFormat, string> = {
  STANDARD: "Standard",
  MODERN: "Modern",
  LEGACY: "Legacy",
  VINTAGE: "Vintage",
  PIONEER: "Pioneer",
  PRE_MODERN: "Pre-Modern",
  PAUPER: "Pauper",
  CUSTOM: "Custom",
};

// "Constructed — Modern" / "Constructed — <custom name>" for a CONSTRUCTED
// pod with a format recorded, otherwise just the plain format label.
export function podFormatDisplay(pod: Pick<Pod, "format" | "constructedFormat" | "constructedFormatCustom">): string {
  if (pod.format !== "CONSTRUCTED" || !pod.constructedFormat) return podFormatLabel[pod.format];
  const detail =
    pod.constructedFormat === "CUSTOM" ? pod.constructedFormatCustom : constructedFormatLabel[pod.constructedFormat];
  return detail ? `${podFormatLabel[pod.format]} — ${detail}` : podFormatLabel[pod.format];
}
