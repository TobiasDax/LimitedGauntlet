import { useParams } from "react-router-dom";
import { useTournament } from "../features/tournaments/useTournament";
import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";

export function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useTournament(id);

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!data) return <p className="text-ink-muted">Tournament not found.</p>;

  const { tournament } = data;

  return (
    <div>
      <Eyebrow>Weekend overview</Eyebrow>
      <ScreenTitle>{tournament.name}</ScreenTitle>
      <ScreenDek>
        {tournament.pods.length === 0
          ? "No pods yet — add one to start pairing."
          : `${tournament.pods.length} pod${tournament.pods.length === 1 ? "" : "s"} · ${tournament.players.length} player${tournament.players.length === 1 ? "" : "s"} attending`}
      </ScreenDek>
    </div>
  );
}
