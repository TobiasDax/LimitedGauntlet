import { useEffect, useRef, useState } from "react";
import { entrantDisplayName } from "../lib/entrant";
import type { Entrant } from "../lib/types";
import { Card } from "./ui";

// Pod seating chart (PI-51, sealed added in PI-79, dynamic column layout
// added in PI-114): a physical table layout derived from round 1's
// pairings. Two layouts, picked at render time from the chart's actual
// on-screen width (via ResizeObserver) rather than a fixed player-count
// cutoff, so it adapts to phones/tablets/desktops instead of just breaking
// at some arbitrary entrant count:
//   - Row mode (wide enough): two rows of ceil(N/2) seats, the second row
//     reversed, so reading row 1 left-to-right then row 2 right-to-left
//     traces the seating order clockwise around the table (seat 1 -> 2 ->
//     ... -> N -> back to 1). Matches the layout the group has always used
//     on paper/Outline for this.
//   - Column mode (row mode would squeeze each seat below a comfortable
//     minimum width, e.g. a big pod on a phone): the same loop rotated 90
//     degrees -- two columns of ceil(N/2) seats, right column top-to-bottom
//     (seat 1 at the top), left column top-to-bottom (seat N at the top,
//     continuing down to the seat adjacent to N's counterpart at the
//     bottom) -- same clockwise story, just read top-to-bottom on the
//     right then bottom-to-top on the left.
const MIN_SEAT_WIDTH_PX = 84;
const SEAT_GAP_PX = 8; // matches gap-2

export function SeatingChart({
  seatByEntrantId,
  entrantById,
  entrantCount,
  showByeBadge = true,
}: {
  seatByEntrantId: Map<string, number>;
  entrantById: Map<string, Entrant>;
  entrantCount: number;
  // PI-115 — a single physical table within a split pod is real seats only
  // (no artificially-doubled slot), so an odd table size never implies an
  // empty/bye chair the way a whole unsplit pod's does. Split-table callers
  // pass false to suppress the badge entirely, since the pod-wide bye
  // entrant (there's only ever one) may or may not even sit at this table.
  showByeBadge?: boolean;
}) {
  const tableCount = Math.ceil(entrantCount / 2);
  const entrantBySeat = new Map<number, Entrant>();
  for (const [entrantId, seat] of seatByEntrantId) {
    const entrant = entrantById.get(entrantId);
    if (entrant) entrantBySeat.set(seat, entrant);
  }

  const topRow = Array.from({ length: tableCount }, (_, i) => i + 1);
  const bottomRow = Array.from({ length: entrantCount - tableCount }, (_, i) => entrantCount - i);
  const byeSeat = showByeBadge && entrantCount % 2 === 1 ? tableCount : null;
  // An odd entrant count leaves one chair unused in this layout -- always
  // the one adjacent to seat 1 (directly below it in row mode, immediately
  // to its left in column mode), not wherever the round-1 bye happens to
  // fall, so each seat number keeps a fixed position on the table
  // regardless of pod size or who got the bye.
  const emptyBottomSlot = entrantCount % 2 === 1;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Row mode needs `tableCount` seats to fit side by side at a readable
  // width -- once the measured container can't offer that, flip to two
  // columns instead. Scales with pod size automatically: a small pod's
  // threshold is small (row mode fits almost any screen), a big pod's
  // threshold is large (flips even on a wide-ish window).
  const rowModeMinWidth = tableCount * MIN_SEAT_WIDTH_PX + (tableCount - 1) * SEAT_GAP_PX;
  const isColumnMode = containerWidth != null && containerWidth < rowModeMinWidth;

  const cell = (seat: number) => {
    const entrant = entrantBySeat.get(seat);
    const isBye = seat === byeSeat;
    return (
      <div
        key={seat}
        className={`flex min-w-0 flex-col items-center gap-1 rounded-lg border px-3 py-3 text-center ${
          isBye ? "border-dashed border-border bg-surface-sunken" : "border-border bg-surface"
        }`}
      >
        <span className="text-[10.5px] font-semibold tracking-wide text-accent uppercase">Seat {seat}</span>
        <span className="w-full min-w-0 font-display text-[14px] leading-tight font-bold break-words">
          {entrant ? entrantDisplayName(entrant) : "—"}
        </span>
        {isBye && <span className="text-[10px] tracking-wide text-ink-muted uppercase">Round 1 bye</span>}
      </div>
    );
  };

  return (
    <Card className="mb-6 p-5">
      <div className="mb-3 text-[11.5px] font-semibold tracking-wide text-ink-muted uppercase">Seating chart</div>
      {/* w-full on the flex wrapper, each grid row (row mode), and each
          column (column mode): a grid/column nested in a flex container
          should stretch to the cross-axis size via the default
          align-items: stretch, but WebKit/Safari doesn't reliably do that
          once the grid's own cells have min-w-0 + truncate content --
          explicit w-full/flex-1 sidesteps the implicit-stretch quirk
          entirely. */}
      <div ref={containerRef} className={`flex w-full gap-2 ${isColumnMode ? "flex-row" : "flex-col"}`}>
        {isColumnMode ? (
          // A real 2-column CSS Grid, not two independent flex columns: with
          // grid-auto-flow: column and an explicit row count, the browser
          // fills the first `tableCount` DOM items into column 1 (left) then
          // the rest into column 2 (right) -- and because it's one grid,
          // every row's height matches its tallest cell across BOTH columns
          // (default align-items: stretch), so the invisible empty-slot div
          // for an odd entrant count stretches to a full seat's height
          // instead of collapsing to 0px the way it would in a lone flex
          // column with nothing to borrow height from.
          <div
            className="grid w-full gap-2"
            style={{
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gridTemplateRows: `repeat(${tableCount}, minmax(0, 1fr))`,
              gridAutoFlow: "column",
            }}
          >
            {emptyBottomSlot && <div key="empty" aria-hidden="true" />}
            {bottomRow.map(cell)}
            {topRow.map(cell)}
          </div>
        ) : (
          <>
            <div className="grid w-full gap-2" style={{ gridTemplateColumns: `repeat(${tableCount}, minmax(0, 1fr))` }}>
              {topRow.map(cell)}
            </div>
            <div className="grid w-full gap-2" style={{ gridTemplateColumns: `repeat(${tableCount}, minmax(0, 1fr))` }}>
              {emptyBottomSlot && <div key="empty" aria-hidden="true" />}
              {bottomRow.map(cell)}
            </div>
          </>
        )}
      </div>
      <p className="mt-3 text-[11.5px] text-ink-muted">
        {isColumnMode
          ? "Read top-to-bottom on the right, then bottom-to-top on the left — that's the seating order clockwise around the table."
          : "Read left-to-right, then right-to-left along the bottom row — that's the seating order clockwise around the table."}
      </p>
    </Card>
  );
}
