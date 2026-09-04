import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { MatchResult, Round } from "../../lib/types";

export function useRounds(podId: string | undefined) {
  return useQuery({
    queryKey: ["pods", podId, "rounds"],
    queryFn: () => api.get<{ rounds: Round[] }>(`/pods/${podId}/rounds`),
    enabled: !!podId,
  });
}

function invalidatePod(queryClient: ReturnType<typeof useQueryClient>, podId: string) {
  queryClient.invalidateQueries({ queryKey: ["pods", podId] });
}

export function useGenerateRound(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ round: Round }>(`/pods/${podId}/rounds`),
    onSuccess: () => invalidatePod(queryClient, podId),
  });
}

export interface ManualPair {
  entrantAId: string;
  entrantBId: string | null;
}

export function useManualPairRound(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pairs: ManualPair[]) => api.post<{ round: Round }>(`/pods/${podId}/rounds/manual`, { pairs }),
    onSuccess: () => invalidatePod(queryClient, podId),
  });
}

export interface SwapPairingInput {
  roundId: string;
  matchAId: string;
  sideA: "A" | "B";
  matchBId: string;
  sideB: "A" | "B";
}

export function useSwapPairing(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roundId, ...body }: SwapPairingInput) => api.post<{ ok: true }>(`/rounds/${roundId}/swap`, body),
    onSuccess: () => invalidatePod(queryClient, podId),
  });
}

// Undo a round's pairing entirely (PI-56) — only works while it's still
// PENDING. Deletes the round and returns the pod to its pre-pairing
// state so it can be re-paired from scratch.
export function useUnpairRound(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roundId: string) => api.delete<void>(`/rounds/${roundId}`),
    onSuccess: () => invalidatePod(queryClient, podId),
  });
}

export function useStartRound(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roundId: string) => api.post<{ round: Round }>(`/rounds/${roundId}/start`),
    onSuccess: () => invalidatePod(queryClient, podId),
  });
}

export function useCompleteRound(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roundId: string) => api.post<{ round: Round }>(`/rounds/${roundId}/complete`),
    onSuccess: () => invalidatePod(queryClient, podId),
  });
}

export function useExtendRound(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roundId, minutes }: { roundId: string; minutes: number }) =>
      api.post<{ round: Round }>(`/rounds/${roundId}/extend`, { minutes }),
    onSuccess: () => invalidatePod(queryClient, podId),
  });
}

// PI-78 — who (if anyone) dropped when this result was reported. "NONE" is
// the default the backend assumes when the field is omitted entirely, so
// every pre-PI-78 caller of this mutation keeps working unchanged.
export type DroppedSelection = "NONE" | "A" | "B" | "BOTH";

export interface SubmitResultInput {
  matchId: string;
  result: MatchResult;
  gamesWonA: number;
  gamesWonB: number;
  gamesDrawn: number;
  dropped?: DroppedSelection;
}

export function useSubmitResult(podId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ matchId, ...body }: SubmitResultInput) => api.patch(`/matches/${matchId}/result`, body),
    onSuccess: () => invalidatePod(queryClient, podId),
  });
}

export function roundErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.message === "previous_round_not_completed") return "Finish and complete the current round first.";
    if (err.message === "round_count_exceeded") return "This pod's rounds are all done.";
    if (err.message === "pairing_failed") return "Couldn't find a valid pairing that avoids all repeats.";
    if (err.message === "results_missing") return "Every match needs a result before completing the round.";
    if (err.message === "invalid_pairing") return "That pairing doesn't cover every active entrant exactly once.";
    if (err.message === "round_locked") return "This round has already started — swaps only work before it starts.";
    if (err.message === "cannot_swap_bye") return "Can't swap into or out of a bye slot.";
    if (err.message === "no_op") return "Pick two different seats to swap.";
    if (err.message === "round_already_started") return "This round has already started — it can't be un-paired anymore.";
  }
  return "Something went wrong.";
}
