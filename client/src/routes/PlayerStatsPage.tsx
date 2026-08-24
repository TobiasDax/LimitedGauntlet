import { Link, useParams } from "react-router-dom";
import { usePlayerStats } from "../features/hallOfFame/useHallOfFame";
import { podFormatLabel } from "../features/pods/usePods";
import { formatEur } from "../components/CardGallery";
import { Card, Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";
import type { HeadToHeadEntry } from "../lib/types";

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="font-display text-[24px] font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] tracking-wide text-ink-muted uppercase">{label}</div>
      {sub && <div className="mt-1 text-[11.5px] text-ink-secondary">{sub}</div>}
    </Card>
  );
}

function HeadToHeadCard({ title, entry }: { title: string; entry: HeadToHeadEntry | null }) {
  if (!entry) return null;
  return (
    <Card className="p-4">
      <div className="text-[11px] tracking-wide text-ink-muted uppercase">{title}</div>
      <div className="font-display mt-1 text-[17px] font-bold">{entry.displayName}</div>
      <div className="mt-1 text-[12.5px] text-ink-secondary">
        {entry.wins}-{entry.losses}-{entry.draws} ({pct(entry.winPct)} win rate over {entry.matches} match
        {entry.matches === 1 ? "" : "es"})
      </div>
    </Card>
  );
}

function HeadToHeadChart({ entries }: { entries: HeadToHeadEntry[] }) {
  if (entries.length === 0) return null;
  const max = Math.max(...entries.map((e) => e.matches));
  return (
    <Card className="p-5">
      <div className="mb-3 text-[12px] font-semibold tracking-wide text-ink-secondary uppercase">
        Record vs. every opponent
      </div>
      <div className="flex flex-col gap-2.5">
        {entries.map((e) => (
          <div key={e.playerId} className="flex items-center gap-3">
            <div className="w-24 shrink-0 truncate text-right text-[13px]">{e.displayName}</div>
            <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
              {e.wins > 0 && <div className="h-full bg-good" style={{ width: `${(e.wins / max) * 100}%` }} />}
              {e.draws > 0 && (
                <div className="h-full bg-ink-muted/50" style={{ width: `${(e.draws / max) * 100}%` }} />
              )}
              {e.losses > 0 && <div className="h-full bg-critical" style={{ width: `${(e.losses / max) * 100}%` }} />}
            </div>
            <div className="w-16 shrink-0 text-[12px] tabular-nums text-ink-muted">
              {e.wins}-{e.losses}-{e.draws}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-good" /> win
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ink-muted/50" /> draw
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-critical" /> loss
        </span>
      </div>
    </Card>
  );
}

export function PlayerStatsPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const { data, isLoading } = usePlayerStats(playerId);

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!data) return <p className="text-ink-muted">Player not found.</p>;

  const s = data.stats;

  return (
    <div>
      <Eyebrow>
        <Link to="/hall-of-fame" className="hover:text-accent-strong">
          Hall of Fame
        </Link>
      </Eyebrow>
      <ScreenTitle>{s.displayName}</ScreenTitle>
      <ScreenDek>
        {s.matchesPlayed} match{s.matchesPlayed === 1 ? "" : "es"} across {s.podsPlayed} pod
        {s.podsPlayed === 1 ? "" : "s"} and {s.tournamentsPlayed} tournament{s.tournamentsPlayed === 1 ? "" : "s"}.
      </ScreenDek>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Match record" value={`${s.wins}-${s.losses}-${s.draws}`} sub={pct(s.matchWinPct)} />
        <StatTile label="Game win %" value={pct(s.gameWinPct)} />
        <StatTile label="Pod wins" value={String(s.podWins)} />
        <StatTile label="Weekend wins" value={String(s.weekendWins)} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Longest win streak" value={String(s.longestWinStreak)} />
        <StatTile
          label="Best format"
          value={s.bestFormat ? podFormatLabel[s.bestFormat.format] : "—"}
          sub={s.bestFormat ? `${pct(s.bestFormat.winPct)} over ${s.bestFormat.matches} matches` : "Not enough data yet"}
        />
        <StatTile label="Avg. finish" value={s.averageFinish !== null ? s.averageFinish.toFixed(1) : "—"} />
        <StatTile label="Undefeated pods" value={String(s.undefeatedPods)} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatTile
          label="Total value pulled"
          value={formatEur(s.totalValuePulled || null)}
          sub={s.biggestPull ? `Biggest: ${s.biggestPull.cardName} (${formatEur(s.biggestPull.priceEur)})` : undefined}
        />
        <StatTile
          label="Most-played opponent"
          value={s.mostPlayedOpponent ? s.mostPlayedOpponent.displayName : "—"}
          sub={s.mostPlayedOpponent ? `${s.mostPlayedOpponent.matches} matches` : undefined}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <HeadToHeadCard title="Nemesis" entry={s.nemesis} />
        <HeadToHeadCard title="Victim" entry={s.victim} />
      </div>

      <HeadToHeadChart entries={s.headToHead} />
    </div>
  );
}
