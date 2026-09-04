import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePod } from "../features/pods/usePods";
import { useGenerateRound, useRounds, roundErrorMessage } from "../features/pods/useRounds";
import { usePodRealtime } from "../features/pods/usePodRealtime";
import { computeSeatings } from "../lib/seatings";
import { SeatingChart } from "../components/SeatingChart";
import { ManualPairingForm } from "../components/ManualPairingForm";
import { PodTabs } from "../components/PodTabs";
import { Button, Eyebrow, FormError, ScreenDek, ScreenTitle } from "../components/ui";

// PI-79 — same format list as PodTabs' Seatings-tab visibility check: the
// formats where packs (or a sealed pool) actually get seated around a table.
const seatingFormats = new Set(["DRAFT", "CHAOS_DRAFT", "SEALED"]);

// PI-80 — every seating-related UI lives on its own tab now, not folded
// into the Pairings tab the way PI-51 originally shipped it. "Generate
// seatings" here creates round 1's Match rows exactly as the Pairings tab's
// own generate action would (same mutation) — it just renders only the
// derived SeatingChart, no "who plays whom" listing anywhere on this page.
// Revealing those pairings is a separate, later action on the Pairings tab.
export function SeatingsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: podData } = usePod(id);
  const { data: roundsData, isLoading } = useRounds(id);
  const generateRound = useGenerateRound(id ?? "");
  usePodRealtime(id, podData?.pod.tournamentId);
  const [showManual, setShowManual] = useState(false);

  if (isLoading || !podData) return <p className="text-ink-muted">Loading…</p>;

  const pod = podData.pod;
  const entrantById = new Map(pod.entrants.map((e) => [e.id, e]));
  const rounds = roundsData?.rounds ?? [];
  const round1 = rounds.find((r) => r.roundNumber === 1);
  const seatByEntrantId = round1 ? computeSeatings(round1.matches, pod.entrants.length) : null;
  const usesSeating = seatingFormats.has(pod.format);

  return (
    <div>
      <Eyebrow>
        <Link to={`/pods/${id}`} className="hover:text-accent-strong">
          {pod.name}
        </Link>
      </Eyebrow>
      <ScreenTitle>Seatings</ScreenTitle>
      <ScreenDek>
        {usesSeating
          ? "Who sits where — generated from round 1's pairings, without revealing opponents yet."
          : "This pod's format doesn't use a physical seating chart."}
      </ScreenDek>

      <PodTabs podId={pod.id} />

      {!usesSeating ? (
        <p className="text-ink-muted">Seatings only apply to Draft, Chaos Draft, and Sealed pods.</p>
      ) : !round1 ? (
        pod.entrants.length < 2 ? (
          <p className="text-ink-muted">Add at least 2 entrants before generating seatings.</p>
        ) : !showManual ? (
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={() => generateRound.mutate()} disabled={generateRound.isPending}>
              {generateRound.isPending ? "Generating…" : "Generate seatings"}
            </Button>
            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="text-[12.5px] text-ink-secondary underline hover:text-accent-strong"
            >
              Seat manually instead
            </button>
            {generateRound.isError && <FormError>{roundErrorMessage(generateRound.error)}</FormError>}
          </div>
        ) : (
          <ManualPairingForm
            podId={pod.id}
            activeEntrants={pod.entrants}
            roundNumber={1}
            onDone={() => setShowManual(false)}
            onCancel={() => setShowManual(false)}
          />
        )
      ) : seatByEntrantId && seatByEntrantId.size > 0 ? (
        <>
          <SeatingChart seatByEntrantId={seatByEntrantId} entrantById={entrantById} entrantCount={pod.entrants.length} />
          <p className="text-[13px] text-ink-secondary">
            Seatings are generated. Head to the{" "}
            <Link to={`/pods/${id}/rounds`} className="text-link underline hover:text-link-strong">
              Pairings tab
            </Link>{" "}
            to reveal round 1's pairings once everyone's found their seat.
          </p>
        </>
      ) : (
        <p className="text-ink-muted">No seatings yet.</p>
      )}
    </div>
  );
}
