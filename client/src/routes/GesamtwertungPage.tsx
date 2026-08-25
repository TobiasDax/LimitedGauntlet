import { Link, useParams } from "react-router-dom";
import { useGesamtwertung } from "../features/tournaments/useGesamtwertung";
import { useTournament } from "../features/tournaments/useTournament";
import { useTournamentRealtime } from "../features/tournaments/useTournamentRealtime";
import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";
import { GesamtwertungList } from "../components/GesamtwertungList";

export function GesamtwertungPage() {
  const { id } = useParams<{ id: string }>();
  const { data: tournamentData } = useTournament(id);
  const { data, isLoading } = useGesamtwertung(id);
  useTournamentRealtime(id);

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!data) return <p className="text-ink-muted">Not found.</p>;

  return (
    <div>
      <Eyebrow>
        <Link to={`/tournaments/${id}`} className="hover:text-accent-strong">
          {tournamentData?.tournament.name ?? "Tournament overview"}
        </Link>
      </Eyebrow>
      <ScreenTitle>Tournament Standings</ScreenTitle>
      <ScreenDek>Ranked by average points per pod played, not raw total — nobody's penalized for missing an event.</ScreenDek>

      <GesamtwertungList pods={data.pods} rows={data.gesamtwertung} />
    </div>
  );
}
