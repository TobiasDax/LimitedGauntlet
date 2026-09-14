import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePod } from "../features/pods/usePods";
import { useGenerateRound, useRounds, roundErrorMessage } from "../features/pods/useRounds";
import { usePodRealtime } from "../features/pods/usePodRealtime";
import { useOnDemandStartGuard } from "../features/pods/useOnDemandStartGuard";
import { computeSeatings, computeSplitSeatings, groupSeatsByTable } from "../lib/seatings";
import { validateTableShape, SPLIT_ELIGIBLE_ABOVE } from "../lib/tableShape";
import { SeatingChart } from "../components/SeatingChart";
import { TableShapeForm } from "../components/TableShapeForm";
import { ManualPairingForm } from "../components/ManualPairingForm";
import { OnDemandConflictModal } from "../components/OnDemandConflictModal";
import { PodTabs } from "../components/PodTabs";
import { Button, Eyebrow, FormError, ScreenDek, ScreenTitle } from "../components/ui";

// PI-79 — same format list as PodTabs' Seatings-tab visibility check: the
// formats where packs (or a sealed pool) actually get seated around a table.
const seatingFormats = new Set(["DRAFT", "CHAOS_DRAFT", "SEALED"]);

// PI-115 — splitting into multiple physical tables is a draft-specific,
// pack-passing concern (sealed doesn't pass packs around a table).
const splitFormats = new Set(["DRAFT", "CHAOS_DRAFT"]);

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
  const startGuard = useOnDemandStartGuard();
  usePodRealtime(id, podData?.pod.tournamentId);
  const [showManual, setShowManual] = useState(false);
  // PI-115 — undefined = one big table (today's behavior); only offered/read
  // before round 1 exists, see TableShapeForm below.
  const [tableSizes, setTableSizes] = useState<number[] | undefined>(undefined);

  const runGenerate = (resolution?: "withdraw" | "keep") =>
    generateRound.mutate(
      { resolution, tableSizes },
      {
        onError: (e) => {
          if (startGuard.catchConflicts(e)) generateRound.reset();
        },
        onSuccess: startGuard.clear,
      },
    );

  if (isLoading || !podData) return <p className="text-ink-muted">Loading…</p>;

  const pod = podData.pod;
  const entrantById = new Map(pod.entrants.map((e) => [e.id, e]));
  const rounds = roundsData?.rounds ?? [];
  const round1 = rounds.find((r) => r.roundNumber === 1);
  const usesSeating = seatingFormats.has(pod.format);

  // PI-115 — which table each entrant sits at (Entrant.draftTable) comes
  // from the fill step, not pairing — but the seat *numbers* within a table
  // still derive from round 1's real pairing wherever it landed at that
  // table (see computeSplitSeatings).
  const entrantTable = new Map(
    pod.entrants.filter((e) => e.draftTable !== null).map((e) => [e.id, e.draftTable!] as const),
  );
  const splitSeats =
    entrantTable.size > 0 && round1 ? groupSeatsByTable(computeSplitSeatings(round1.matches, entrantTable)) : null;
  const seatByEntrantId = !splitSeats && round1 ? computeSeatings(round1.matches, pod.entrants.length) : null;

  const offerSplit = splitFormats.has(pod.format) && pod.entrants.length > SPLIT_ELIGIBLE_ABOVE;
  const shapeError = tableSizes ? validateTableShape(pod.entrants.length, tableSizes) : null;

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

      {startGuard.conflicts && (
        <OnDemandConflictModal
          conflicts={startGuard.conflicts}
          pending={generateRound.isPending}
          onWithdraw={() => runGenerate("withdraw")}
          onKeep={() => runGenerate("keep")}
          onClose={startGuard.clear}
        />
      )}

      {!usesSeating ? (
        <p className="text-ink-muted">Seatings only apply to Draft, Chaos Draft, and Sealed pods.</p>
      ) : !round1 ? (
        pod.entrants.length < 2 ? (
          <p className="text-ink-muted">Add at least 2 entrants before generating seatings.</p>
        ) : (
          <>
            {offerSplit && <TableShapeForm entrantCount={pod.entrants.length} onChange={setTableSizes} />}
            {!showManual ? (
              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  onClick={() => runGenerate()}
                  disabled={generateRound.isPending || !!shapeError}
                >
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
                tableSizes={tableSizes}
                onDone={() => setShowManual(false)}
                onCancel={() => setShowManual(false)}
              />
            )}
          </>
        )
      ) : splitSeats ? (
        <>
          {[...splitSeats.entries()]
            .sort(([a], [b]) => a - b)
            .map(([table, seatByEntrantIdForTable]) => (
              <div key={table} className="mb-6">
                <h3 className="mb-2 font-display text-[14px] font-bold">
                  Table {table} ({seatByEntrantIdForTable.size} players)
                </h3>
                <SeatingChart
                  seatByEntrantId={seatByEntrantIdForTable}
                  entrantById={entrantById}
                  entrantCount={seatByEntrantIdForTable.size}
                  showByeBadge={false}
                />
              </div>
            ))}
          <p className="text-[13px] text-ink-secondary">
            Seatings are generated. Head to the{" "}
            <Link to={`/pods/${id}/rounds`} className="text-link underline hover:text-link-strong">
              Pairings tab
            </Link>{" "}
            to reveal round 1's pairings once everyone's found their seat.
          </p>
        </>
      ) : seatByEntrantId && seatByEntrantId.size > 0 ? (
        <>
          <SeatingChart
            seatByEntrantId={seatByEntrantId}
            entrantById={entrantById}
            entrantCount={pod.entrants.length}
          />
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
