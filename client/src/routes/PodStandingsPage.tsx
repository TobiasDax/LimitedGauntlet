import { Link, useParams } from "react-router-dom";
import { useStandings } from "../features/pods/useStandings";
import { useSetManualTiebreak } from "../features/pods/useEntrants";
import { usePod, podFormatLabel } from "../features/pods/usePods";
import { entrantDisplayName } from "../lib/entrant";
import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";
import { PodTabs } from "../components/PodTabs";
import { usePodRealtime } from "../features/pods/usePodRealtime";
import type { StandingsRow } from "../lib/types";

function pct(value: number): string {
  return (value * 100).toFixed(2);
}

export function PodStandingsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: podData } = usePod(id);
  const { data, isLoading } = useStandings(id);
  const setTiebreak = useSetManualTiebreak(id ?? "");
  usePodRealtime(id, podData?.pod.tournamentId);

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!data) return <p className="text-ink-muted">Not found.</p>;

  const pod = podData?.pod;
  const rows = data.standings;

  // Swaps two adjacent rows that are tied on points by assigning them
  // fresh manualTiebreak values reflecting the new order — the value
  // itself is just their target display position, it only ever matters
  // relative to another entrant on the same points (see the sort in
  // standings.ts), so reusing row indices is fine.
  function swap(i: number, j: number) {
    const lower = Math.min(i, j);
    const higher = Math.max(i, j);
    const rowAtLower = rows[lower];
    const rowAtHigher = rows[higher];
    if (!rowAtLower || !rowAtHigher) return;
    setTiebreak.mutate({ entrantId: rowAtHigher.entrantId, manualTiebreak: lower });
    setTiebreak.mutate({ entrantId: rowAtLower.entrantId, manualTiebreak: higher });
  }

  function isTiedWith(a: StandingsRow | undefined, b: StandingsRow | undefined): boolean {
    return !!a && !!b && a.points === b.points;
  }

  return (
    <div>
      <Eyebrow>
        <Link to={`/pods/${id}`} className="hover:text-accent-strong">
          {pod ? pod.name : "Pod"}
        </Link>
        {pod && ` · ${podFormatLabel[pod.format]}`}
      </Eyebrow>
      <ScreenTitle>Standings</ScreenTitle>
      <ScreenDek>
        Points, then the standard tiebreakers — opponents' match-win %, game-win %, opponents' game-win %. Tied rows
        can be manually reordered with the arrows (e.g. when a final-round draw was agreed to lock in placement).
      </ScreenDek>

      <PodTabs podId={id!} />

      {rows.length === 0 ? (
        <p className="text-ink-muted">No entrants yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[620px] border-collapse">
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
                <th className="bg-surface-sunken px-4 py-3 text-right text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                  Order
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const tiedAbove = isTiedWith(row, rows[i - 1]);
                const tiedBelow = isTiedWith(row, rows[i + 1]);
                return (
                  <tr key={row.entrantId} className={i === 0 ? "bg-accent-wash shadow-[inset_3px_0_0_var(--color-accent)]" : ""}>
                    <td className="border-t border-border px-4 py-3.5 font-semibold">
                      {entrantDisplayName(row.entrant)}
                      {row.manualTiebreak !== null && (
                        <span
                          title="This tied position was set manually, not computed"
                          className="ml-2 text-[10.5px] font-normal tracking-wide text-ink-muted uppercase"
                        >
                          ✋ manual
                        </span>
                      )}
                    </td>
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
                    <td className="border-t border-border px-4 py-3.5">
                      {(tiedAbove || tiedBelow) && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => swap(i, i - 1)}
                            disabled={!tiedAbove || setTiebreak.isPending}
                            title="Move up (tied on points)"
                            className="grid h-6 w-6 place-items-center rounded border border-border-strong text-[11px] text-ink-secondary hover:text-ink disabled:opacity-30"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => swap(i, i + 1)}
                            disabled={!tiedBelow || setTiebreak.isPending}
                            title="Move down (tied on points)"
                            className="grid h-6 w-6 place-items-center rounded border border-border-strong text-[11px] text-ink-secondary hover:text-ink disabled:opacity-30"
                          >
                            ▼
                          </button>
                          {row.manualTiebreak !== null && (
                            <button
                              onClick={() => setTiebreak.mutate({ entrantId: row.entrantId, manualTiebreak: null })}
                              disabled={setTiebreak.isPending}
                              title="Clear manual order for this entrant"
                              className="ml-1 text-[11px] text-ink-muted hover:text-critical disabled:opacity-30"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
