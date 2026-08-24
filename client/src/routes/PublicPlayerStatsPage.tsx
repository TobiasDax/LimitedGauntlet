import { Link, useParams } from "react-router-dom";
import { usePublicPlayerStats } from "../features/public/usePublic";
import { PlayerStatsBody } from "../components/PlayerStatsBody";
import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";

export function PublicPlayerStatsPage() {
  const { slug, playerId } = useParams<{ slug: string; playerId: string }>();
  const { data, isLoading } = usePublicPlayerStats(slug, playerId);

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!data) return <p className="text-ink-muted">Player not found.</p>;

  const s = data.stats;

  return (
    <div>
      <Eyebrow>
        <Link to={`/o/${slug}/hall-of-fame`} className="hover:text-accent-strong">
          Hall of Fame
        </Link>
      </Eyebrow>
      <ScreenTitle>{s.displayName}</ScreenTitle>
      <ScreenDek>
        {s.matchesPlayed} match{s.matchesPlayed === 1 ? "" : "es"} across {s.podsPlayed} pod
        {s.podsPlayed === 1 ? "" : "s"} and {s.tournamentsPlayed} tournament{s.tournamentsPlayed === 1 ? "" : "s"}.
      </ScreenDek>

      <PlayerStatsBody stats={s} tournamentLinkTo={(id) => `/o/${slug}/tournaments/${id}`} />
    </div>
  );
}
