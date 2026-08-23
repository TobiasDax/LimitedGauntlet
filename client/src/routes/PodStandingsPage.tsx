import { Link, useParams } from "react-router-dom";
import { useStandings } from "../features/pods/useStandings";
import { usePod, podFormatLabel } from "../features/pods/usePods";
import { entrantDisplayName } from "../lib/entrant";
import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";
import { PodTabs } from "../components/PodTabs";
import { usePodRealtime } from "../features/pods/usePodRealtime";

function pct(value: number): string {
  return (value * 100).toFixed(2);
}

export function PodStandingsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: podData } = usePod(id);
  const { data, isLoading } = useStandings(id);
  usePodRealtime(id, podData?.pod.tournamentId);

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!data) return <p className="text-ink-muted">Not found.</p>;

  const pod = podData?.pod;

  return (
    <div>
      <Eyebrow>
        <Link to={`/pods/${id}`} className="hover:text-accent-strong">
          {pod ? pod.name : "Pod"}
        </Link>
        {pod && ` · ${podFormatLabel[pod.format]}`}
      </Eyebrow>
      <ScreenTitle>Standings</ScreenTitle>
      <ScreenDek>Points, then the standard tiebreakers — opponents' match-win %, game-win %, opponents' game-win %.</ScreenDek>

      <PodTabs podId={id!} />

      {data.standings.length === 0 ? (
        <p className="text-ink-muted">No entrants yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr>
                <th className="bg-surface-sunken px-4 py-3 text-left text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                  {pod?.isTeamEvent ? "Team" : "Player"}
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
              {data.standings.map((row, i) => (
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
      )}
    </div>
  );
}
