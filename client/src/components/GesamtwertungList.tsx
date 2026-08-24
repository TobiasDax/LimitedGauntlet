import type { GesamtwertungPod, GesamtwertungRow } from "../lib/types";

export function rankBadgeClasses(rank: number): string {
  if (rank === 1) return "bg-accent border-accent text-[#241c0a]";
  if (rank === 2) return "border-[#c8c8c8]/40 text-[#d7d5cf]";
  if (rank === 3) return "border-[#c48e58]/45 text-[#cf9a6b]";
  return "border-border-strong text-ink-secondary";
}

export function GesamtwertungList({ pods, rows }: { pods: GesamtwertungPod[]; rows: GesamtwertungRow[] }) {
  if (rows.length === 0) {
    return <p className="text-ink-muted">No players attending yet.</p>;
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
              className={`grid grid-cols-[44px_1fr_auto_auto] items-center gap-5 rounded-md border px-4 py-3.5 ${
                rank === 1 ? "border-accent/35 bg-gradient-to-r from-accent-wash to-surface" : "border-border bg-surface"
              }`}
            >
              <div
                className={`grid h-[34px] w-[34px] place-items-center rounded border font-display text-[15px] font-bold ${rankBadgeClasses(rank)}`}
              >
                {rank}
              </div>

              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-display text-[17px] font-bold">{row.player.displayName}</span>
                <span className="text-[12px] text-ink-muted">
                  {row.eventsPlayed} of {pods.length} pod{pods.length === 1 ? "" : "s"} played
                </span>
              </div>

              <div className="text-right">
                <div
                  className={`font-display tabular-nums text-[26px] leading-none font-bold ${rank === 1 ? "text-accent-strong" : ""}`}
                >
                  {row.average.toFixed(1)}
                </div>
                <div className="mt-0.5 text-[10.5px] tracking-wide text-ink-muted uppercase">
                  avg · {row.totalPoints} total
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-1">
                {pods.map((pod) => {
                  const points = row.perPod[pod.id];
                  const attended = points !== undefined;
                  return (
                    <div
                      key={pod.id}
                      title={pod.name}
                      className={`grid h-[26px] min-w-[26px] place-items-center rounded border border-border px-1 text-[11px] tabular-nums ${
                        attended && points > 0 ? "bg-surface-raised text-ink-secondary" : "text-ink-muted"
                      }`}
                    >
                      {attended ? points : "–"}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {pods.length > 0 && (
        <p className="mt-4 text-[11.5px] text-ink-muted">Pips, left to right: {pods.map((p) => p.name).join(" · ")}</p>
      )}
    </>
  );
}
