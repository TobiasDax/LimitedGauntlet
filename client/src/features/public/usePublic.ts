import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type {
  CardPull,
  Entrant,
  GesamtwertungPod,
  GesamtwertungRow,
  HallOfFameBiggestPull,
  HallOfFameHeadline,
  HallOfFameRow,
  MostPlayedPairing,
  Organization,
  Player,
  PlayerStatsDetail,
  Pod,
  Round,
  StandingsRow,
  Tournament,
} from "../../lib/types";
import type { LongestWinStreak } from "../hallOfFame/useHallOfFame";

// The org landing page ("send one link, browse everything") and the
// public roster — the two pages every other public page's nav links to,
// so they're kept at the top of this file next to each other.
export function usePublicOrganization(slug: string | undefined) {
  return useQuery({
    queryKey: ["public", "organization", slug],
    queryFn: () => api.get<{ organization: Organization; tournaments: Tournament[] }>(`/public/o/${slug}`),
    enabled: !!slug,
  });
}

export function usePublicRoster(slug: string | undefined) {
  return useQuery({
    queryKey: ["public", "roster", slug],
    queryFn: () => api.get<{ organization: Organization; players: Player[] }>(`/public/o/${slug}/roster`),
    enabled: !!slug,
  });
}

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

export interface PublicHallOfFameResponse {
  organization: Organization;
  hallOfFame: HallOfFameRow[];
  headline: HallOfFameHeadline;
  longestWinStreak: LongestWinStreak | null;
  mostPlayedPairings: MostPlayedPairing[];
  biggestPulls: HallOfFameBiggestPull[];
}

export function usePublicHallOfFame(slug: string | undefined) {
  return useQuery({
    queryKey: ["public", "hall-of-fame", slug],
    queryFn: () => api.get<PublicHallOfFameResponse>(`/public/o/${slug}/hall-of-fame`),
    enabled: !!slug,
  });
}

export function usePublicPlayerStats(slug: string | undefined, playerId: string | undefined) {
  return useQuery({
    queryKey: ["public", "hall-of-fame", slug, "players", playerId],
    queryFn: () => api.get<{ stats: PlayerStatsDetail }>(`/public/o/${slug}/hall-of-fame/players/${playerId}`),
    enabled: !!slug && !!playerId,
  });
}

export function usePublicTreasureChest(slug: string | undefined) {
  return useQuery({
    queryKey: ["public", "treasure-chest", slug],
    queryFn: () => api.get<{ organization: Organization; cardPulls: CardPull[] }>(`/public/o/${slug}/treasure-chest`),
    enabled: !!slug,
  });
}
