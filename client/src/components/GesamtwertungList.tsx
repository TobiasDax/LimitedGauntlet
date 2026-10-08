import { Link } from "react-router-dom";
import type { GesamtwertungPod, GesamtwertungRow } from "../lib/types";

export function rankBadgeClasses(rank: number): string {
  if (rank === 1) return "bg-accent border-accent text-on-accent";
  if (rank === 2) return "border-rank-silver/40 text-rank-silver";
  if (rank === 3) return "border-rank-bronze/40 text-rank-bronze";
  return "border-border-strong text-ink-muted";
}

export function GesamtwertungList({
  pods,
  rows,
  playerLinkTo,
  podLinkTo,
}: {
  pods: GesamtwertungPod[];
  rows: GesamtwertungRow[];
  // Same pattern as HallOfFamePage/PublicHallOfFamePage — only the route
  // prefix differs between the authed and public callers.
  playerLinkTo: (playerId: string) => string;
  podLinkTo: (podId: string) => string;
}) {
  if (rows.length === 0) {
    return <p className="text-ink-muted">No one has played a pod yet.</p>;
  }

  let rank = 0;
  let prevAvg: number | null = null;
  let prevTotal: number | null = null;

  return (
    <>
      <div className="flex flex-col gap-0.5">
        {rows.map((row, i) => {
          const tied = row.average === prevAvg && row.totalPoints === prevTotal;
          if (!tied) rank = i + 1;
          prevAvg = row.average;
          prevTotal = row.totalPoints;

          return (
            <div
              key={row.playerId}
              className={`flex flex-col gap-2.5 rounded-md border px-4 py-3.5 ${
                rank === 1 ? "border-accent/35 bg-gradient-to-r from-accent/14 to-surface" : "border-border bg-surface"
              }`}
            >
              <div className="grid grid-cols-[44px_1fr_auto] items-center gap-5">
                <div
                  className={`grid h-[34px] w-[34px] place-items-center rounded border font-display text-base font-bold ${rankBadgeClasses(rank)}`}
                >
                  {rank}
                </div>

                <div className="flex min-w-0 flex-col gap-0.5">
                  <Link
                    to={playerLinkTo(row.playerId)}
                    className="truncate font-display text-lg font-bold hover:text-accent"
                  >
                    {row.player.displayName}
                  </Link>
                  <span className="text-xs text-ink-muted">
                    {row.eventsPlayed} of {pods.length} pod{pods.length === 1 ? "" : "s"} played
                  </span>
                </div>

                <div className="text-right">
                  <div
                    className={`font-display tabular-nums text-2xl leading-none font-bold ${rank === 1 ? "text-accent" : ""}`}
                  >
                    {row.average.toFixed(1)}
                  </div>
                  <div className="mt-0.5 text-2xs tracking-wide text-ink-muted uppercase">
                    avg · {row.totalPoints} total
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-1">
                {pods.map((pod) => {
                  const points = row.perPod[pod.id];
                  const attended = points !== undefined;
                  return (
                    <Link
                      key={pod.id}
                      to={podLinkTo(pod.id)}
                      title={pod.name}
                      className={`grid h-[26px] min-w-[26px] place-items-center rounded border border-border px-1 text-2xs tabular-nums transition-colors hover:border-accent hover:text-ink ${
                        attended && points > 0 ? "bg-surface-raised text-ink-muted" : "text-ink-muted"
                      }`}
                    >
                      {attended ? points : "–"}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {pods.length > 0 && (
        <p className="mt-4 text-2xs text-ink-muted">
          Pips, left to right: {pods.map((p) => p.name).join(" · ")}
          <br />
          Only pods that have started appear here — a pod still in setup gets a column once its first round begins.
        </p>
      )}
    </>
  );
}
