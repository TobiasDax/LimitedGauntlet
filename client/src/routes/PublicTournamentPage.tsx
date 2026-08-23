import { Link, useParams } from "react-router-dom";
import { usePublicGesamtwertung, usePublicTournament } from "../features/public/usePublic";
import { useTournamentRealtime } from "../features/tournaments/useTournamentRealtime";
import { Card, Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";
import { GesamtwertungList } from "../components/GesamtwertungList";
import { podFormatLabel } from "../features/pods/usePods";

export function PublicTournamentPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const { data, isLoading } = usePublicTournament(slug, id);
  const { data: gwData } = usePublicGesamtwertung(slug, id);
  useTournamentRealtime(id);

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!data) return <p className="text-ink-muted">Tournament not found.</p>;

  const { organization, tournament } = data;

  return (
    <div>
      <Eyebrow>{organization.name}</Eyebrow>
      <ScreenTitle>{tournament.name}</ScreenTitle>
      <ScreenDek>
        {tournament.pods.length} pod{tournament.pods.length === 1 ? "" : "s"} · {tournament.players.length} player
        {tournament.players.length === 1 ? "" : "s"} attending
      </ScreenDek>

      {tournament.pods.length > 0 && (
        <div className="mb-10 flex flex-col gap-2">
          {tournament.pods.map((pod) => (
            <Link key={pod.id} to={`/o/${slug}/tournaments/${id}/pods/${pod.id}`}>
              <Card className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-surface-raised">
                <div>
                  <div className="font-display text-[16px] font-bold">{pod.name}</div>
                  <div className="text-[12.5px] text-ink-muted">
                    {podFormatLabel[pod.format]}
                    {pod.isTeamEvent && ` · teams of ${pod.teamSize}`} · {pod.roundCount} rounds
                  </div>
                </div>
                <span className="text-[11.5px] tracking-wide text-ink-secondary uppercase">{pod.status}</span>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <h2 className="font-display mb-1 text-[22px] font-bold">Gesamtwertung</h2>
      <p className="mb-6 text-[13px] text-ink-secondary">
        Ranked by average points per pod played, not raw total.
      </p>
      {gwData ? (
        <GesamtwertungList pods={gwData.pods} rows={gwData.gesamtwertung} />
      ) : (
        <p className="text-ink-muted">Loading…</p>
      )}
    </div>
  );
}
