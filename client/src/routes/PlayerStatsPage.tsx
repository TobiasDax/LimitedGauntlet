import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePlayerStats } from "../features/hallOfFame/useHallOfFame";
import { useAdjustTokens, useTokenLedger } from "../features/tokens/useTokens";
import { PlayerStatsBody } from "../components/PlayerStatsBody";
import { PlayerTokenLedger } from "../components/PlayerTokenLedger";
import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";

function TokensTab({ playerId }: { playerId: string }) {
  const { data: ledger, isLoading } = useTokenLedger(playerId);
  const adjust = useAdjustTokens(playerId);
  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!ledger) return <p className="text-ink-muted">Tokens aren't enabled for this organization.</p>;
  return <PlayerTokenLedger ledger={ledger} adjust={adjust} />;
}

export function PlayerStatsPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const { data, isLoading } = usePlayerStats(playerId);
  const [tab, setTab] = useState<"overview" | "tokens">("overview");

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!data) return <p className="text-ink-muted">Player not found.</p>;

  const s = data.stats;
  const tokensOn = s.tokenBalance !== null;

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

      {tokensOn && (
        <div className="mb-6 flex gap-1 border-b border-border">
          {(["overview", "tokens"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-[12.5px] tracking-wide uppercase ${
                tab === t ? "border-accent text-ink" : "border-transparent text-ink-secondary hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {tokensOn && tab === "tokens" ? (
        <TokensTab playerId={playerId!} />
      ) : (
        <PlayerStatsBody stats={s} tournamentLinkTo={(id) => `/tournaments/${id}`} />
      )}
    </div>
  );
}
