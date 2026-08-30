export interface Organizer {
  id: string;
  orgId: string;
  email: string;
  name: string;
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
}

export interface Player {
  id: string;
  orgId: string;
  displayName: string;
  createdAt: string;
}

export type TournamentStatus = "PLANNING" | "ACTIVE" | "COMPLETED";

export interface Tournament {
  id: string;
  orgId: string;
  name: string;
  startDate: string;
  endDate: string;
  location: string | null;
  description: string | null;
  status: TournamentStatus;
  createdAt: string;
}

export type PodFormat = "DRAFT" | "SEALED" | "CHAOS_DRAFT" | "CONSTRUCTED" | "CUSTOM";
export type ConstructedFormat =
  | "STANDARD"
  | "MODERN"
  | "LEGACY"
  | "VINTAGE"
  | "PIONEER"
  | "PRE_MODERN"
  | "PAUPER"
  | "CUSTOM";
export type MatchFormat = "BO1" | "BO3";
export type PodStatus = "SETUP" | "PAIRING" | "IN_PROGRESS" | "COMPLETED";

export interface Pod {
  id: string;
  tournamentId: string;
  name: string;
  date: string | null;
  format: PodFormat;
  sequenceOrder: number;
  isTeamEvent: boolean;
  teamSize: number | null;
  roundCount: number;
  matchFormat: MatchFormat;
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  roundLengthMinutes: number;
  packConfig: string | null;
  rarepicUrl: string | null;
  status: PodStatus;
  excludeFromStats: boolean;
  webhookEnabled: boolean;
  isMainEvent: boolean;
  setCode: string | null;
  constructedFormat: ConstructedFormat | null;
  constructedFormatCustom: string | null;
  prepTimerEndsAt: string | null;
  prepTimerLabel: string | null;
  createdAt: string;
  // Present only on pods nested in a tournament-detail response (PI-58) —
  // just enough to derive a progress label client-side, not the full
  // Round/Match payload the pairings page needs.
  rounds?: { roundNumber: number; status: RoundStatus }[];
}

export interface TeamMember {
  teamId: string;
  playerId: string;
  player: Player;
}

export interface Team {
  id: string;
  podId: string;
  name: string;
  members: TeamMember[];
}

export interface Entrant {
  id: string;
  podId: string;
  playerId: string | null;
  teamId: string | null;
  droppedAfterRound: number | null;
  player: Player | null;
  team: Team | null;
}

export type RoundStatus = "PENDING" | "ACTIVE" | "COMPLETED";
export type MatchResult = "PENDING" | "A_WINS" | "B_WINS" | "DRAW";

export interface Match {
  id: string;
  roundId: string;
  tableNumber: number;
  entrantAId: string;
  entrantBId: string | null;
  gamesWonA: number;
  gamesWonB: number;
  gamesDrawn: number;
  result: MatchResult;
  reportedAt: string | null;
}

export interface Round {
  id: string;
  podId: string;
  roundNumber: number;
  startedAt: string | null;
  endsAt: string | null;
  status: RoundStatus;
  matches: Match[];
}

export interface StandingsRow {
  entrantId: string;
  points: number;
  matchWinPct: number;
  gameWinPct: number;
  opponentsMatchWinPct: number;
  opponentsGameWinPct: number;
  manualTiebreak: number | null;
  entrant: Entrant;
}

export interface GesamtwertungPod {
  id: string;
  name: string;
  sequenceOrder: number;
}

export interface GesamtwertungRow {
  playerId: string;
  eventsPlayed: number;
  totalPoints: number;
  average: number;
  perPod: Record<string, number>;
  player: Player;
}

export interface MainEventWin {
  podId: string;
  podName: string;
  tournamentId: string;
  tournamentName: string;
}

export interface HallOfFameRow {
  playerId: string;
  tournamentsPlayed: number;
  podsPlayed: number;
  totalPoints: number;
  average: number;
  mainEventWins: MainEventWin[];
  player: Player;
}

export interface CoveragePair {
  playerAId: string;
  playerBId: string;
  count: number;
}

export interface HallOfFameHeadline {
  tournaments: number;
  pods: number;
  players: number;
}

export interface MostPlayedPairing {
  playerAId: string;
  playerAName: string;
  playerBId: string;
  playerBName: string;
  matches: number;
}

export interface HallOfFameBiggestPull {
  id: string;
  cardName: string;
  priceEur: number | null;
  imageUri: string | null;
}

export interface HeadToHeadEntry {
  playerId: string;
  displayName: string;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  winPct: number;
}

export type PodFormatCode = "DRAFT" | "SEALED" | "CHAOS_DRAFT" | "CONSTRUCTED" | "CUSTOM";

export interface PlayerStatsDetail {
  playerId: string;
  displayName: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  matchWinPct: number;
  gameWinPct: number;
  podsPlayed: number;
  tournamentsPlayed: number;
  podWins: number;
  weekendWins: number;
  longestWinStreak: number;
  bestFormat: { format: PodFormatCode; winPct: number; matches: number } | null;
  averageFinish: number | null;
  undefeatedPods: number;
  totalValuePulled: number;
  biggestPull: { cardName: string; priceEur: number } | null;
  cardPulls: CardPull[];
  mostPlayedOpponent: HeadToHeadEntry | null;
  nemesis: HeadToHeadEntry | null;
  victim: HeadToHeadEntry | null;
  headToHead: HeadToHeadEntry[];
}

export interface CardPull {
  id: string;
  podId: string;
  playerId: string | null;
  playerIdInferred: boolean;
  cardName: string;
  scryfallId: string | null;
  setCode: string | null;
  foil: boolean;
  priceEur: number | null;
  imageUri: string | null;
  addedAt: string;
  player?: Player | null;
  pod?: { id: string; name: string; tournament?: { id: string; name: string } };
}

export interface ScryfallSet {
  code: string;
  name: string;
  releasedAt: string | null;
}

export interface ScryfallCardSummary {
  scryfallId: string;
  name: string;
  setCode: string;
  priceEur: number | null;
  imageUri: string | null;
}
