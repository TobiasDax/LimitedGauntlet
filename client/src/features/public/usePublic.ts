import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type {
  CardPull,
  Entrant,
  GesamtwertungPod,
  GesamtwertungRow,
  Organization,
  Pod,
  Round,
  StandingsRow,
  Tournament,
} from "../../lib/types";

export interface PublicTournamentDetail extends Tournament {
  pods: Pod[];
  players: Array<{ tournamentId: string; playerId: string; player: { id: string; displayName: string } }>;
}

export function usePublicTournament(slug: string | undefined, tournamentId: string | undefined) {
  return useQuery({
    queryKey: ["public", "tournaments", tournamentId],
    queryFn: () =>
      api.get<{ organization: Organization; tournament: PublicTournamentDetail }>(
        `/public/o/${slug}/tournaments/${tournamentId}`,
      ),
    enabled: !!slug && !!tournamentId,
  });
}

export function usePublicGesamtwertung(slug: string | undefined, tournamentId: string | undefined) {
  return useQuery({
    queryKey: ["public", "tournaments", tournamentId, "gesamtwertung"],
    queryFn: () =>
      api.get<{ pods: GesamtwertungPod[]; gesamtwertung: GesamtwertungRow[] }>(
        `/public/o/${slug}/tournaments/${tournamentId}/gesamtwertung`,
      ),
    enabled: !!slug && !!tournamentId,
  });
}

export function usePublicTournamentCardPulls(slug: string | undefined, tournamentId: string | undefined) {
  return useQuery({
    queryKey: ["public", "tournaments", tournamentId, "card-pulls"],
    queryFn: () =>
      api.get<{ cardPulls: CardPull[]; total: number }>(`/public/o/${slug}/tournaments/${tournamentId}/card-pulls`),
    enabled: !!slug && !!tournamentId,
  });
}

export interface PublicPodDetail extends Pod {
  entrants: Entrant[];
}

export function usePublicPod(slug: string | undefined, podId: string | undefined) {
  return useQuery({
    queryKey: ["public", "pods", podId],
    queryFn: () => api.get<{ pod: PublicPodDetail }>(`/public/o/${slug}/pods/${podId}`),
    enabled: !!slug && !!podId,
  });
}

export function usePublicRounds(slug: string | undefined, podId: string | undefined) {
  return useQuery({
    queryKey: ["public", "pods", podId, "rounds"],
    queryFn: () => api.get<{ rounds: Round[] }>(`/public/o/${slug}/pods/${podId}/rounds`),
    enabled: !!slug && !!podId,
  });
}

export function usePublicStandings(slug: string | undefined, podId: string | undefined) {
  return useQuery({
    queryKey: ["public", "pods", podId, "standings"],
    queryFn: () => api.get<{ standings: StandingsRow[] }>(`/public/o/${slug}/pods/${podId}/standings`),
    enabled: !!slug && !!podId,
  });
}

export function usePublicPodCardPulls(slug: string | undefined, podId: string | undefined) {
  return useQuery({
    queryKey: ["public", "pods", podId, "card-pulls"],
    queryFn: () => api.get<{ cardPulls: CardPull[]; total: number }>(`/public/o/${slug}/pods/${podId}/card-pulls`),
    enabled: !!slug && !!podId,
  });
}
