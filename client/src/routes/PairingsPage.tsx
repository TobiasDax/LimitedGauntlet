import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePod } from "../features/pods/usePods";
import {
  useCompleteRound,
  useExtendRound,
  useGenerateRound,
  useManualPairRound,
  useRounds,
  useStartRound,
  useSubmitResult,
  useSwapPairing,
  roundErrorMessage,
} from "../features/pods/useRounds";
import { entrantDisplayName } from "../lib/entrant";
import { Button, Eyebrow, FormError, ScreenDek, ScreenTitle } from "../components/ui";
import { PodTabs } from "../components/PodTabs";
import { PrepTimerDisplay } from "../components/PrepTimer";
import { usePodRealtime } from "../features/pods/usePodRealtime";
import { useCountdown } from "../lib/useCountdown";
import { playChime, playEndChime } from "../lib/chime";
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
          className="text-[11px] text-link underline hover:text-link-strong"
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

// Manual pairing UI: one dropdown-pair row per expected table, each side
// filtering out entrants already picked elsewhere so a duplicate is
// impossible by construction rather than caught after the fact. Backend
// (`invalid_pairing`) is still the real guard — this is just about not
// making the organizer hit it in the first place.
function ManualPairingForm({
  podId,
  activeEntrants,
  roundNumber,
  onDone,
  onCancel,
}: {
  podId: string;
  activeEntrants: Entrant[];
  roundNumber: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const manualPair = useManualPairRound(podId);
  const pairCount = Math.ceil(activeEntrants.length / 2);
  const [pairs, setPairs] = useState<Array<{ a: string; b: string }>>(() =>
    Array.from({ length: pairCount }, () => ({ a: "", b: "" })),
  );

  const usedIds = new Set(pairs.flatMap((p) => [p.a, p.b]).filter(Boolean));
  const optionsFor = (current: string) =>
    activeEntrants.filter((e) => e.id === current || !usedIds.has(e.id));

  const update = (i: number, side: "a" | "b", value: string) =>
    setPairs((prev) => prev.map((p, idx) => (idx === i ? { ...p, [side]: value } : p)));

  const allFilled = pairs.every((p) => p.a);

  return (
    <div className="mt-5 rounded-lg border border-border bg-surface-sunken p-5">
      <div className="mb-4 font-display text-[16px] font-bold">Manual pairing — round {roundNumber}</div>
      <div className="flex flex-col gap-2">
        {pairs.map((pair, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[11px] tracking-wide text-ink-muted uppercase">Table {i + 1}</span>
            <select
              className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
              value={pair.a}
              onChange={(e) => update(i, "a", e.target.value)}
            >
              <option value="">Select…</option>
              {optionsFor(pair.a).map((e) => (
                <option key={e.id} value={e.id}>
                  {entrantDisplayName(e)}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-ink-muted">vs</span>
            <select
              className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
              value={pair.b}
              onChange={(e) => update(i, "b", e.target.value)}
            >
              <option value="">— Bye —</option>
              {optionsFor(pair.b).map((e) => (
                <option key={e.id} value={e.id}>
                  {entrantDisplayName(e)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button
          variant="primary"
          disabled={!allFilled || manualPair.isPending}
          onClick={() =>
            manualPair.mutate(
              pairs.map((p) => ({ entrantAId: p.a, entrantBId: p.b || null })),
              { onSuccess: onDone },
            )
          }
        >
          {manualPair.isPending ? "Publishing…" : "Publish pairing"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {manualPair.isError && <FormError>{roundErrorMessage(manualPair.error)}</FormError>}
    </div>
  );
}

// A slot an entrant occupies — identifies exactly what `useSwapPairing`
// needs (which match, which side) to swap two of these against each
// other. Only meaningful while the round is still PENDING (unstarted).
interface SwapSlot {
  matchId: string;
  side: "A" | "B";
}

function MatchCard({
  match,
  entrantById,
  podId,
  swappable,
  selectedSlot,
  onSelectSlot,
}: {
  match: Match;
  entrantById: Map<string, Entrant>;
  podId: string;
  swappable: boolean;
  selectedSlot: SwapSlot | null;
  onSelectSlot: (slot: SwapSlot) => void;
}) {
  const a = entrantById.get(match.entrantAId);
  const b = match.entrantBId ? entrantById.get(match.entrantBId) : null;

  const renderSeat = (entrant: Entrant | undefined, side: "A" | "B") => {
    if (!entrant) return null;
    if (!swappable) return entrantDisplayName(entrant);
    const isSelected = selectedSlot?.matchId === match.id && selectedSlot.side === side;
    return (
      <button
        type="button"
        onClick={() => onSelectSlot({ matchId: match.id, side })}
        title="Click, then click another seat to swap them"
        className={`rounded px-1 -mx-1 hover:bg-accent-wash ${isSelected ? "bg-accent-wash ring-1 ring-accent" : ""}`}
      >
        {entrantDisplayName(entrant)}
      </button>
    );
  };

  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <div className="mb-1 text-[11px] tracking-wide text-ink-muted uppercase">Table {match.tableNumber}</div>
        <div className="font-display text-[15px] font-bold">
          {a ? renderSeat(a, "A") : "—"}
          {b ? (
            <>
              <span className="mx-2 text-[11px] font-normal text-ink-muted">vs</span>
              {renderSeat(b, "B")}
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

const TEN_MINUTES_MS = 10 * 60 * 1000;
// countdown-bell.mp3 has ~8s of lead-in before the actual bell hit, so start
// playback that far early — the audible ding then lands right at zero.
const EXPIRY_CHIME_LEAD_MS = 8 * 1000;

function RoundTimer({ round, displayMode }: { round: Round; displayMode: boolean }) {
  const countdown = useCountdown(round.endsAt);
  // Only the round's own endsAt identifies "which countdown" — a +5 min
  // extend changes endsAt, so the ref keys naturally allow both chimes to
  // fire again after an extension rather than staying silent forever
  // after the first time this round warned/expired.
  const warnedForRef = useRef<string | null>(null);
  const chimedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!displayMode || !round.endsAt) return;
    if (
      countdown.remainingMs > 0 &&
      countdown.remainingMs <= TEN_MINUTES_MS &&
      warnedForRef.current !== round.endsAt
    ) {
      warnedForRef.current = round.endsAt;
      playChime();
    }
    if (countdown.remainingMs <= EXPIRY_CHIME_LEAD_MS && chimedForRef.current !== round.endsAt) {
      chimedForRef.current = round.endsAt;
      playEndChime();
    }
  }, [countdown.remainingMs, displayMode, round.endsAt]);

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
  const swapPairing = useSwapPairing(podId);
  const [selectedSlot, setSelectedSlot] = useState<SwapSlot | null>(null);

  const allReported = round.matches.every((m) => !m.entrantBId || m.result !== "PENDING");
  const swappable = round.status === "PENDING";

  const handleSelectSlot = (slot: SwapSlot) => {
    if (!selectedSlot) {
      setSelectedSlot(slot);
      return;
    }
    if (selectedSlot.matchId === slot.matchId && selectedSlot.side === slot.side) {
      setSelectedSlot(null); // clicked the same seat again — cancel
      return;
    }
    swapPairing.mutate(
      { roundId: round.id, matchAId: selectedSlot.matchId, sideA: selectedSlot.side, matchBId: slot.matchId, sideB: slot.side },
      { onSettled: () => setSelectedSlot(null) },
    );
  };

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

      {swappable && (
        <p className="mb-3 text-[12px] text-ink-muted">
          Click a name, then click another to swap their seats — only works before the round starts.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {round.matches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            entrantById={entrantById}
            podId={podId}
            swappable={swappable}
            selectedSlot={selectedSlot}
            onSelectSlot={handleSelectSlot}
          />
        ))}
      </div>

      {completeRound.isError && <FormError>{roundErrorMessage(completeRound.error)}</FormError>}
      {swapPairing.isError && <FormError>{roundErrorMessage(swapPairing.error)}</FormError>}
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
  const [showManual, setShowManual] = useState(false);

  if (isLoading || !podData) return <p className="text-ink-muted">Loading…</p>;

  const pod = podData.pod;
  const entrantById = new Map(pod.entrants.map((e) => [e.id, e]));
  const rounds = roundsData?.rounds ?? [];
  const lastRound = rounds[rounds.length - 1];
  const nextRoundNumber = rounds.length + 1;
  const canGenerateNext =
    pod.entrants.length >= 2 &&
    rounds.length < pod.roundCount &&
    (rounds.length === 0 || lastRound?.status === "COMPLETED");
  const activeEntrants = pod.entrants.filter(
    (e) => e.droppedAfterRound === null || e.droppedAfterRound >= nextRoundNumber,
  );

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

      <PrepTimerDisplay endsAt={pod.prepTimerEndsAt} label={pod.prepTimerLabel} size={displayMode ? "large" : "normal"} />

      {pod.entrants.length < 2 && <p className="text-ink-muted">Add at least 2 entrants before pairing round 1.</p>}

      <div className="flex flex-col gap-5">
        {[...rounds].reverse().map((round) => (
          <RoundCard key={round.id} round={round} entrantById={entrantById} podId={pod.id} displayMode={displayMode} />
        ))}
      </div>

      {canGenerateNext && !showManual && (
        <div className="mt-5 flex items-center gap-3">
          <Button variant="primary" onClick={() => generateRound.mutate()} disabled={generateRound.isPending}>
            {generateRound.isPending ? "Pairing…" : `Pair round ${nextRoundNumber}`}
          </Button>
          <button
            type="button"
            onClick={() => setShowManual(true)}
            className="text-[12.5px] text-ink-secondary underline hover:text-accent-strong"
          >
            Pair manually instead
          </button>
          {generateRound.isError && <FormError>{roundErrorMessage(generateRound.error)}</FormError>}
        </div>
      )}

      {canGenerateNext && showManual && (
        <ManualPairingForm
          podId={pod.id}
          activeEntrants={activeEntrants}
          roundNumber={nextRoundNumber}
          onDone={() => setShowManual(false)}
          onCancel={() => setShowManual(false)}
        />
      )}

      {rounds.length >= pod.roundCount && rounds.length > 0 && lastRound?.status === "COMPLETED" && (
        <p className="mt-5 text-[13px] text-ink-muted">All {pod.roundCount} rounds complete.</p>
      )}
    </div>
  );
}
