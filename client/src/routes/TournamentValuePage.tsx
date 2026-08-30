import { Link, useParams } from "react-router-dom";
import { useTournamentCardPulls } from "../features/pods/useCardPulls";
import { useTournament } from "../features/tournaments/useTournament";
import { CardGallery, formatEur } from "../components/CardGallery";
import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";

export function TournamentValuePage() {
  const { id } = useParams<{ id: string }>();
  const { data: tournamentData } = useTournament(id);
  const { data, isLoading } = useTournamentCardPulls(id);

  return (
    <div>
      <Eyebrow>
        <Link to={`/tournaments/${id}`} className="hover:text-accent-strong">
          {tournamentData?.tournament.name ?? "Tournament overview"}
        </Link>
      </Eyebrow>
      <ScreenTitle>Best pulls of the weekend</ScreenTitle>
      <ScreenDek>Every card logged across every pod this tournament, highest value first.</ScreenDek>

      {isLoading ? (
        <p className="text-ink-muted">Loading…</p>
      ) : (
        <>
          <div className="mb-4 flex items-baseline gap-2">
            <span className="font-display text-[24px] font-bold text-accent-strong tabular-nums">
              {formatEur(data?.total ?? 0)}
            </span>
            <span className="text-[11px] tracking-wide text-ink-muted uppercase">weekend total</span>
          </div>
          <CardGallery pulls={data?.cardPulls ?? []} />
        </>
      )}
    </div>
  );
}
