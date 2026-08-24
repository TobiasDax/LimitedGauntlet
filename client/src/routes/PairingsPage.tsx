import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePod } from "../features/pods/usePods";
import {
  useCompleteRound,
  useExtendRound,
  useGenerateRound,
  useRounds,
  useStartRound,
  useSubmitResult,
  roundErrorMessage,
} from "../features/pods/useRounds";
import { entrantDisplayName } from "../lib/entrant";
import { Button, Eyebrow, FormError, ScreenDek, ScreenTitle } from "../components/ui";
import { PodTabs } from "../components/PodTabs";
import { usePodRealtime } from "../features/pods/usePodRealtime";
import { useCountdown } from "../lib/useCountdown";
import { playChime } from "../lib/chime";
import type { Entrant, Match, Round } from "../lib/types";

function ResultEntry({ match, podId }: { match: Match; podId: string }) {
  const submitResult = useSubmitResult(podId);
  const [editing, setEditing] = useState(false);
  const [a, setA] = useState(match.gamesWonA);
  const [b, setB] = useState(match.gamesWonB);
  const [d, setD] = useState(match.gamesDrawn);

  if (match.result !== "PENDING" && !editing) {
    const label =
      match.result === "DRAW" ? "Draw" : match.result === "A_WINS" ? "Table win: seat A" : "Table win: seat B";
    return (
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="font-display tabular-nums text-[15px] font-bold">
            {match.gamesWonA}–{match.gamesWonB}
            {match.gamesDrawn > 0 && <span className="text-ink-muted">–{match.gamesDrawn}</span>}
          </div>
          <div className="text-[11px] text-ink-muted">{label}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            setA(match.gamesWonA);
            setB(match.gamesWonB);
            setD(match.gamesDrawn);
            setEditing(true);
          }}
          className="text-[11px] text-ink-muted underline hover:text-accent-strong"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const result = a > b ? "A_WINS" : b > a ? "B_WINS" : "DRAW";
        submitResult.mutate(
          { matchId: match.id, result, gamesWonA: a, gamesWonB: b, gamesDrawn: d },
          { onSuccess: () => setEditing(false) },
        );
      }}
    >
      <input
        type="number"
        min={0}
        value={a}
        onChange={(e) => setA(Number(e.target.value))}
        className="w-12 rounded border border-border-strong bg-surface px-2 py-1 text-center text-[13px] tabular-nums outline-none focus:border-accent"
      />
      <span className="text-ink-muted">–</span>
      <input
        type="number"
        min={0}
        value={b}
        onChange={(e) => setB(Number(e.target.value))}
        className="w-12 rounded border border-border-strong bg-surface px-2 py-1 text-center text-[13px] tabular-nums outline-none focus:border-accent"
      />
      <input
        type="number"
        min={0}
        value={d}
        onChange={(e) => setD(Number(e.target.value))}
        title="Drawn games (counted as played, credited to neither)"
        aria-label="Drawn games"
        className="w-12 rounded border border-dashed border-border-strong bg-surface px-2 py-1 text-center text-[13px] tabular-nums text-ink-muted outline-none focus:border-accent"
      />
      <Button type="submit" variant="primary" disabled={submitResult.isPending} className="ml-1">
        Submit
      </Button>
      {editing && (
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="ml-1 text-[11px] text-ink-muted underline hover:text-accent-strong"
        >
          Cancel
        </button>
      )}
    </form>
  );
}

function MatchCard({ match, entrantById, podId }: { match: Match; entrantById: Map<string, Entrant>; podId: string }) {
  const a = entrantById.get(match.entrantAId);
  const b = match.entrantBId ? entrantById.get(match.entrantBId) : null;

  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
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
      {b && <ResultEntry match={match} podId={podId} />}
    </div>
  );
}

function RoundTimer({ round, displayMode }: { round: Round; displayMode: boolean }) {
  const countdown = useCountdown(round.endsAt);
  // Only the round's own endsAt identifies "which countdown" — a +5 min
  // extend changes endsAt, so the ref key naturally allows the chime to
  // fire again after an extension rather than staying silent forever
  // after the first time this round expired.
  const chimedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!displayMode || !round.endsAt) return;
    if (countdown.expired && chimedForRef.current !== round.endsAt) {
      chimedForRef.current = round.endsAt;
      playChime();
    }
  }, [countdown.expired, displayMode, round.endsAt]);

  return (
    <div
      className={`font-display tabular-nums font-bold ${countdown.expired ? "text-critical" : "text-accent-strong"} ${
        displayMode ? "text-[64px]" : "text-[26px]"
      }`}
    >
      {countdown.formatted}
    </div>
  );
}

function RoundCard({
  round,
  entrantById,
  podId,
  displayMode,
}: {
  round: Round;
  entrantById: Map<string, Entrant>;
  podId: string;
  displayMode: boolean;
}) {
  const startRound = useStartRound(podId);
  const completeRound = useCompleteRound(podId);
  const extendRound = useExtendRound(podId);

  const allReported = round.matches.every((m) => !m.entrantBId || m.result !== "PENDING");

  return (
    <div className="rounded-lg border border-border bg-surface-sunken p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="font-display text-[18px] font-bold">Round {round.roundNumber}</div>
          <div className="text-[11.5px] tracking-wide text-ink-muted uppercase">{round.status}</div>
        </div>
        {round.status === "ACTIVE" && <RoundTimer round={round} displayMode={displayMode} />}
        <div className="flex items-center gap-2">
          {round.status === "PENDING" && (
            <Button variant="primary" onClick={() => startRound.mutate(round.id)} disabled={startRound.isPending}>
              Start round
            </Button>
          )}
          {round.status === "ACTIVE" && (
            <>
              <Button variant="ghost" onClick={() => extendRound.mutate({ roundId: round.id, minutes: 5 })}>
                +5 min
              </Button>
              <Button
                variant="primary"
                onClick={() => completeRound.mutate(round.id)}
                disabled={!allReported || completeRound.isPending}
              >
                Complete round
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {round.matches.map((m) => (
          <MatchCard key={m.id} match={m} entrantById={entrantById} podId={podId} />
        ))}
      </div>

      {completeRound.isError && <FormError>{roundErrorMessage(completeRound.error)}</FormError>}
    </div>
  );
}

export function PairingsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: podData } = usePod(id);
  const { data: roundsData, isLoading } = useRounds(id);
  const generateRound = useGenerateRound(id ?? "");
  usePodRealtime(id, podData?.pod.tournamentId);
  const [displayMode, setDisplayMode] = useState(false);

  if (isLoading || !podData) return <p className="text-ink-muted">Loading…</p>;

  const pod = podData.pod;
  const entrantById = new Map(pod.entrants.map((e) => [e.id, e]));
  const rounds = roundsData?.rounds ?? [];
  const lastRound = rounds[rounds.length - 1];
  const canGenerateNext =
    pod.entrants.length >= 2 &&
    rounds.length < pod.roundCount &&
    (rounds.length === 0 || lastRound?.status === "COMPLETED");

  return (
    <div>
      <Eyebrow>
        <Link to={`/pods/${id}`} className="hover:text-accent-strong">
          {pod.name}
        </Link>
      </Eyebrow>
      <div className="flex items-start justify-between gap-4">
        <div>
          <ScreenTitle>Pairings</ScreenTitle>
          <ScreenDek>
            {rounds.length} of {pod.roundCount} rounds paired.
          </ScreenDek>
        </div>
        <Button variant={displayMode ? "primary" : "ghost"} onClick={() => setDisplayMode((v) => !v)}>
          {displayMode ? "Exit display mode" : "Display mode"}
        </Button>
      </div>
      {displayMode && (
        <p className="mb-6 -mt-4 text-[12px] text-ink-muted">
          This device will chime when the round timer hits zero. Leave other devices out of display mode so the room
          doesn't fill with simultaneous beeps.
        </p>
      )}

      <PodTabs podId={pod.id} />

      {pod.entrants.length < 2 && <p className="text-ink-muted">Add at least 2 entrants before pairing round 1.</p>}

      <div className="flex flex-col gap-5">
        {[...rounds].reverse().map((round) => (
          <RoundCard key={round.id} round={round} entrantById={entrantById} podId={pod.id} displayMode={displayMode} />
        ))}
      </div>

      {canGenerateNext && (
        <div className="mt-5">
          <Button variant="primary" onClick={() => generateRound.mutate()} disabled={generateRound.isPending}>
            {generateRound.isPending ? "Pairing…" : `Pair round ${rounds.length + 1}`}
          </Button>
          {generateRound.isError && <FormError>{roundErrorMessage(generateRound.error)}</FormError>}
        </div>
      )}

      {rounds.length >= pod.roundCount && rounds.length > 0 && lastRound?.status === "COMPLETED" && (
        <p className="mt-5 text-[13px] text-ink-muted">All {pod.roundCount} rounds complete.</p>
      )}
    </div>
  );
}
