import { Link } from "react-router-dom";
import { rankBadgeClasses } from "./GesamtwertungList";
import { formatEur } from "./CardGallery";
import { Card } from "./ui";
import type { LongestWinStreak } from "../features/hallOfFame/useHallOfFame";
import type { HallOfFameBiggestPull, HallOfFameHeadline, HallOfFameRow, MostPlayedPairing } from "../lib/types";

// Shared between the authed HallOfFamePage and the public
// /o/:slug/hall-of-fame page — same rich overview either way, only the
// player-profile link target differs (authed vs public route).

export function HeadlineStats({
  headline,
  longestWinStreak,
  playerLinkTo,
}: {
  headline: HallOfFameHeadline;
  longestWinStreak: LongestWinStreak | null;
  playerLinkTo: (playerId: string) => string;
}) {
  const stats = [
    { label: "Tournaments", value: headline.tournaments },
    { label: "Pods played", value: headline.pods },
    { label: "Players", value: headline.players },
  ];
  return (
    <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className="p-4 text-center">
          <div className="font-display text-[28px] font-bold tabular-nums">{s.value}</div>
          <div className="mt-0.5 text-[11px] tracking-wide text-ink-muted uppercase">{s.label}</div>
        </Card>
      ))}
      {longestWinStreak && (
        <Link
          to={playerLinkTo(longestWinStreak.playerId)}
          className="rounded-lg border border-accent/35 bg-gradient-to-br from-accent-wash to-surface p-4 text-center transition-colors hover:bg-surface-raised"
        >
          <div className="font-display text-[28px] font-bold text-accent-strong tabular-nums">
            🔥 {longestWinStreak.streak}
          </div>
          <div className="mt-0.5 truncate text-[11px] tracking-wide text-ink-muted uppercase">
            Win streak · {longestWinStreak.displayName}
          </div>
        </Link>
      )}
    </div>
  );
}

export function HallOfFameList({
  rows,
  playerLinkTo,
  mainEventLinkTo,
}: {
  rows: HallOfFameRow[];
  playerLinkTo: (playerId: string) => string;
  // Each crown links to its own pod (a player can have several main-event
  // wins across different tournaments) — takes the win's ids since the
  // public route needs the tournamentId too, the authed one doesn't.
  mainEventLinkTo: (win: HallOfFameRow["mainEventWins"][number]) => string;
}) {
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
          // A full-card Link (the visible content is pointer-events-none so
          // clicks fall through to it) plus independently-clickable crown
          // links layered on top — can't nest a <Link> inside a <Link>, so
          // this is the escape hatch for "whole row navigates to the
          // player, except the crowns which navigate to their own pod."
          <div
            key={row.playerId}
            className={`relative grid grid-cols-[44px_1fr_auto] items-center gap-5 rounded-md border px-4 py-3.5 transition-colors hover:bg-surface-raised ${
              rank === 1 ? "border-accent/35 bg-gradient-to-r from-accent-wash to-surface" : "border-border bg-surface"
            }`}
          >
            <Link to={playerLinkTo(row.playerId)} className="absolute inset-0" aria-label={row.player.displayName} />

            <div
              className={`pointer-events-none grid h-[34px] w-[34px] place-items-center rounded border font-display text-[15px] font-bold ${rankBadgeClasses(rank)}`}
            >
              {rank}
            </div>

            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="pointer-events-none font-display text-[17px] font-bold">{row.player.displayName}</span>
              <span className="pointer-events-none text-[12px] text-ink-muted">
                {row.podsPlayed} pod{row.podsPlayed === 1 ? "" : "s"} · {row.tournamentsPlayed} tournament
                {row.tournamentsPlayed === 1 ? "" : "s"}
              </span>
              {row.mainEventWins.length > 0 && (
                <div className="relative z-[1] mt-0.5 flex flex-wrap gap-1">
                  {row.mainEventWins.map((win) => (
                    <Link
                      key={win.podId}
                      to={mainEventLinkTo(win)}
                      title={`Main event win — ${win.tournamentName}: ${win.podName}`}
                      className="text-[13px] leading-none hover:scale-110"
                    >
                      👑
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="pointer-events-none text-right">
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

export function MostPlayedPairings({ pairings }: { pairings: MostPlayedPairing[] }) {
  if (pairings.length === 0) return null;
  const max = Math.max(...pairings.map((p) => p.matches));
  return (
    <Card className="p-5">
      <div className="mb-3 text-[12px] font-semibold tracking-wide text-ink-secondary uppercase">
        Most-played pairings
      </div>
      <div className="flex flex-col gap-2.5">
        {pairings.map((p) => (
          <div key={`${p.playerAId}:${p.playerBId}`} className="flex items-center gap-3">
            <div className="w-[42%] shrink-0 text-right text-[13px]">
              {p.playerAName} <span className="text-ink-muted">vs</span> {p.playerBName}
            </div>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(p.matches / max) * 100}%` }} />
            </div>
            <div className="w-6 shrink-0 text-[12px] tabular-nums text-ink-muted">{p.matches}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function BiggestPulls({ pulls }: { pulls: HallOfFameBiggestPull[] }) {
  if (pulls.length === 0) return null;
  return (
    <Card className="p-5">
      <div className="mb-3 text-[12px] font-semibold tracking-wide text-ink-secondary uppercase">Biggest pulls</div>
      <div className="flex flex-col gap-2">
        {pulls.map((p) => (
          <div key={p.id} className="flex items-center gap-3">
            <div className="h-10 w-8 shrink-0 overflow-hidden rounded bg-surface-sunken">
              {p.imageUri && <img src={p.imageUri} alt={p.cardName} className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1 truncate text-[13px]">{p.cardName}</div>
            <div className="text-[12.5px] font-bold text-accent-strong tabular-nums">{formatEur(p.priceEur)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
