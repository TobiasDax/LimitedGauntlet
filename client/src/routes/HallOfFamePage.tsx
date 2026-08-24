import { useHallOfFame } from "../features/hallOfFame/useHallOfFame";
import { rankBadgeClasses } from "../components/GesamtwertungList";
import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";
import type { HallOfFameRow } from "../lib/types";

function HallOfFameList({ rows }: { rows: HallOfFameRow[] }) {
  let rank = 0;
  let prevAvg: number | null = null;
  let prevTotal: number | null = null;

  return (
    <div className="flex flex-col gap-0.5">
      {rows.map((row, i) => {
        const tied = row.average === prevAvg && row.totalPoints === prevTotal;
        if (!tied) rank = i + 1;
        prevAvg = row.average;
        prevTotal = row.totalPoints;

        return (
          <div
            key={row.playerId}
            className={`grid grid-cols-[44px_1fr_auto] items-center gap-5 rounded-md border px-4 py-3.5 ${
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
                {row.podsPlayed} pod{row.podsPlayed === 1 ? "" : "s"} · {row.tournamentsPlayed} tournament
                {row.tournamentsPlayed === 1 ? "" : "s"}
              </span>
            </div>

            <div className="text-right">
              <div
                className={`font-display tabular-nums text-[26px] leading-none font-bold ${rank === 1 ? "text-accent-strong" : ""}`}
              >
                {row.average.toFixed(2)}
              </div>
              <div className="mt-0.5 text-[10.5px] tracking-wide text-ink-muted uppercase">
                avg · {row.totalPoints} total
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function HallOfFamePage() {
  const { data, isLoading } = useHallOfFame();

  return (
    <div>
      <Eyebrow>Your organization</Eyebrow>
      <ScreenTitle>Hall of Fame</ScreenTitle>
      <ScreenDek>
        All-time player standings across every tournament this group has ever run — ranked by average points per pod,
        so attending fewer events isn't penalized.
      </ScreenDek>

      {isLoading ? (
        <p className="text-ink-muted">Loading…</p>
      ) : !data || data.hallOfFame.length === 0 ? (
        <p className="text-ink-muted">No results yet — play some pods first.</p>
      ) : (
        <HallOfFameList rows={data.hallOfFame} />
      )}
    </div>
  );
}
