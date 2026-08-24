import { Link, useParams } from "react-router-dom";
import {
  usePublicGesamtwertung,
  usePublicTournament,
  usePublicTournamentCardPulls,
} from "../features/public/usePublic";
import { useTournamentRealtime } from "../features/tournaments/useTournamentRealtime";
import { Card, Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";
import { GesamtwertungList } from "../components/GesamtwertungList";
import { CardGallery, formatEur } from "../components/CardGallery";
import { RichText } from "../components/RichText";
import { podFormatLabel } from "../features/pods/usePods";
import type { CardPull } from "../lib/types";

export function PublicTournamentPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const { data, isLoading } = usePublicTournament(slug, id);
  const { data: gwData } = usePublicGesamtwertung(slug, id);
  const { data: pullsData } = usePublicTournamentCardPulls(slug, id);
  useTournamentRealtime(id);

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!data) return <p className="text-ink-muted">Tournament not found.</p>;

  const { organization, tournament } = data;

  // Group the (already price-sorted) pulls by pod, then order the groups by the
  // tournament's own pod sequence so it reads "by event, highest value first."
  const pullsByPod = new Map<string, CardPull[]>();
  for (const pull of pullsData?.cardPulls ?? []) {
    const podId = pull.pod?.id ?? pull.podId;
    const group = pullsByPod.get(podId);
    if (group) group.push(pull);
    else pullsByPod.set(podId, [pull]);
  }
  const podValueGroups = tournament.pods
    .map((pod) => {
      const pulls = pullsByPod.get(pod.id) ?? [];
      return { pod, pulls, subtotal: pulls.reduce((sum, p) => sum + (p.priceEur ?? 0), 0) };
    })
    .filter((group) => group.pulls.length > 0);

  return (
    <div>
      <Eyebrow>{organization.name}</Eyebrow>
      <ScreenTitle>{tournament.name}</ScreenTitle>
      <ScreenDek>
        {tournament.pods.length} pod{tournament.pods.length === 1 ? "" : "s"} · {tournament.players.length} player
        {tournament.players.length === 1 ? "" : "s"} attending
      </ScreenDek>

      {tournament.description && <RichText text={tournament.description} className="mb-8" />}

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

      {podValueGroups.length > 0 && (
        <section className="mt-12">
          <div className="mb-1 flex items-baseline justify-between gap-4">
            <h2 className="font-display text-[22px] font-bold">Card values</h2>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[20px] font-bold text-accent-strong tabular-nums">
                {formatEur(pullsData?.total ?? 0)}
              </span>
              <span className="text-[11px] tracking-wide text-ink-muted uppercase">weekend total</span>
            </div>
          </div>
          <p className="mb-6 text-[13px] text-ink-secondary">
            Every card logged across the weekend, by pod, highest value first.
          </p>
          <div className="flex flex-col gap-8">
            {podValueGroups.map(({ pod, pulls, subtotal }) => (
              <div key={pod.id}>
                <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-border pb-1.5">
                  <h3 className="font-display text-[16px] font-bold">{pod.name}</h3>
                  <span className="text-[12.5px] font-bold text-accent-strong tabular-nums">{formatEur(subtotal)}</span>
                </div>
                <CardGallery pulls={pulls} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
