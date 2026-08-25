import { Link, useParams } from "react-router-dom";
import {
  usePublicPod,
  usePublicPodCardPulls,
  usePublicRounds,
  usePublicStandings,
} from "../features/public/usePublic";
import { usePodRealtime } from "../features/pods/usePodRealtime";
import { podFormatLabel } from "../features/pods/usePods";
import { entrantDisplayName } from "../lib/entrant";
import { useCountdown } from "../lib/useCountdown";
import { PrepTimerDisplay } from "../components/PrepTimer";
import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";
import { CardGallery, formatEur } from "../components/CardGallery";
import type { Entrant, Match, Round } from "../lib/types";

function PublicMatchRow({ match, entrantById }: { match: Match; entrantById: Map<string, Entrant> }) {
  const a = entrantById.get(match.entrantAId);
  const b = match.entrantBId ? entrantById.get(match.entrantBId) : null;

  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
      <div>
        <div className="mb-1 text-[11px] tracking-wide text-ink-muted uppercase">Table {match.tableNumber}</div>
        <div className="font-display text-[15px] font-bold">
          {a ? entrantDisplayName(a) : "—"}
          {b ? (
            <>
              <span className="mx-2 text-[11px] font-normal text-ink-muted">vs</span>
              {entrantDisplayName(b)}
            </>
          ) : (
            <span className="ml-2 text-[11px] font-normal text-ink-muted uppercase">Bye</span>
          )}
        </div>
      </div>
      {b && match.result !== "PENDING" && (
        <div className="font-display text-[15px] font-bold tabular-nums">
          {match.gamesWonA}–{match.gamesWonB}
          {match.gamesDrawn > 0 && <span className="text-ink-muted">–{match.gamesDrawn}</span>}
        </div>
      )}
    </div>
  );
}

function PublicRoundSection({ round, entrantById }: { round: Round; entrantById: Map<string, Entrant> }) {
  const countdown = useCountdown(round.status === "ACTIVE" ? round.endsAt : null);

  return (
    <div className="rounded-lg border border-border bg-surface-sunken p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="font-display text-[18px] font-bold">Round {round.roundNumber}</div>
          <div className="text-[11.5px] tracking-wide text-ink-muted uppercase">{round.status}</div>
        </div>
        {round.status === "ACTIVE" && (
          <div
            className={`font-display text-[32px] font-bold tabular-nums ${countdown.expired ? "text-critical" : "text-accent-strong"}`}
          >
            {countdown.formatted}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {round.matches.map((m) => (
          <PublicMatchRow key={m.id} match={m} entrantById={entrantById} />
        ))}
      </div>
    </div>
  );
}

function pct(value: number): string {
  return (value * 100).toFixed(2);
}

export function PublicPodPage() {
  const { slug, tournamentId, podId } = useParams<{ slug: string; tournamentId: string; podId: string }>();
  const { data: podData } = usePublicPod(slug, podId);
  const { data: roundsData } = usePublicRounds(slug, podId);
  const { data: standingsData } = usePublicStandings(slug, podId);
  const { data: valueData } = usePublicPodCardPulls(slug, podId);
  usePodRealtime(podId, tournamentId);

  if (!podData) return <p className="text-ink-muted">Loading…</p>;

  const pod = podData.pod;
  const entrantById = new Map(pod.entrants.map((e) => [e.id, e]));
  const rounds = [...(roundsData?.rounds ?? [])].reverse();

  return (
    <div>
      <Eyebrow>
        <Link to={`/o/${slug}/tournaments/${tournamentId}`} className="hover:text-accent-strong">
          {podFormatLabel[pod.format]}
        </Link>
      </Eyebrow>
      <ScreenTitle>{pod.name}</ScreenTitle>
      <ScreenDek>
        {pod.isTeamEvent ? `Team event — teams of ${pod.teamSize}` : "Individual entrants"} · {pod.roundCount} rounds
      </ScreenDek>

      <PrepTimerDisplay endsAt={pod.prepTimerEndsAt} label={pod.prepTimerLabel} size="large" />

      <section className="mb-12">
        <h2 className="font-display mb-4 text-[20px] font-bold">Pairings</h2>
        {rounds.length === 0 ? (
          <p className="text-ink-muted">Not paired yet.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {rounds.map((round) => (
              <PublicRoundSection key={round.id} round={round} entrantById={entrantById} />
            ))}
          </div>
        )}
      </section>

      <section className="mb-12">
        <h2 className="font-display mb-4 text-[20px] font-bold">Standings</h2>
        {standingsData && standingsData.standings.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr>
                  <th className="bg-surface-sunken px-4 py-3 text-left text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                    {pod.isTeamEvent ? "Team" : "Player"}
                  </th>
                  <th className="bg-surface-sunken px-4 py-3 text-right text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                    Points
                  </th>
                  <th className="bg-surface-sunken px-4 py-3 text-right text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                    OMW%
                  </th>
                  <th className="bg-surface-sunken px-4 py-3 text-right text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                    GW%
                  </th>
                  <th className="bg-surface-sunken px-4 py-3 text-right text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                    OGW%
                  </th>
                </tr>
              </thead>
              <tbody>
                {standingsData.standings.map((row, i) => (
                  <tr key={row.entrantId} className={i === 0 ? "bg-accent-wash shadow-[inset_3px_0_0_var(--color-accent)]" : ""}>
                    <td className="border-t border-border px-4 py-3.5 font-semibold">{entrantDisplayName(row.entrant)}</td>
                    <td className="border-t border-border px-4 py-3.5 text-right text-[15px] font-bold tabular-nums">
                      {row.points}
                    </td>
                    <td className="border-t border-border px-4 py-3.5 text-right text-ink-secondary tabular-nums">
                      {pct(row.opponentsMatchWinPct)}
                    </td>
                    <td className="border-t border-border px-4 py-3.5 text-right text-ink-secondary tabular-nums">
                      {pct(row.gameWinPct)}
                    </td>
                    <td className="border-t border-border px-4 py-3.5 text-right text-ink-secondary tabular-nums">
                      {pct(row.opponentsGameWinPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-ink-muted">No entrants yet.</p>
        )}
      </section>

      <section>
        <h2 className="font-display mb-4 text-[20px] font-bold">Value</h2>
        <div className="mb-4 flex items-baseline gap-2">
          <span className="font-display text-[22px] font-bold text-accent-strong tabular-nums">
            {formatEur(valueData?.total ?? 0)}
          </span>
          <span className="text-[11px] tracking-wide text-ink-muted uppercase">pod total</span>
        </div>
        <CardGallery pulls={valueData?.cardPulls ?? []} />
      </section>
    </div>
  );
}
