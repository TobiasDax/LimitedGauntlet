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

export interface SubmitResultInput {
  matchId: string;
  result: MatchResult;
  gamesWonA: number;
  gamesWonB: number;
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
  }
  return "Something went wrong.";
}
