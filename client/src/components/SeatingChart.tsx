import { entrantDisplayName } from "../lib/entrant";
import type { Entrant } from "../lib/types";
import { Card } from "./ui";

// Pod seating chart (PI-51, sealed added in PI-79): a physical table layout derived from round
// 1's pairings — two rows of ceil(N/2) seats, the second row reversed, so
// reading row 1 left-to-right then row 2 right-to-left traces the seating
// order clockwise around the table (seat 1 → 2 → … → N → back to 1). Matches
// the layout the group has always used on paper/Outline for this.
export function SeatingChart({
  seatByEntrantId,
  entrantById,
  entrantCount,
}: {
  seatByEntrantId: Map<string, number>;
  entrantById: Map<string, Entrant>;
  entrantCount: number;
}) {
  const tableCount = Math.ceil(entrantCount / 2);
  const entrantBySeat = new Map<number, Entrant>();
  for (const [entrantId, seat] of seatByEntrantId) {
    const entrant = entrantById.get(entrantId);
    if (entrant) entrantBySeat.set(seat, entrant);
  }

  const topRow = Array.from({ length: tableCount }, (_, i) => i + 1);
  const bottomRow = Array.from({ length: entrantCount - tableCount }, (_, i) => entrantCount - i);
  const byeSeat = entrantCount % 2 === 1 ? tableCount : null;
  // An odd entrant count leaves one chair unused in this two-row layout —
  // always the one under seat 1, not wherever the round-1 bye happens to
  // fall, so each seat number keeps a fixed position on the table
  // regardless of pod size or who got the bye.
  const emptyBottomSlot = entrantCount % 2 === 1;

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
        <span className="min-w-0 truncate font-display text-[14px] font-bold">
          {entrant ? entrantDisplayName(entrant) : "—"}
        </span>
        {isBye && <span className="text-[10px] tracking-wide text-ink-muted uppercase">Round 1 bye</span>}
      </div>
    );
  };

  return (
    <Card className="mb-6 p-5">
      <div className="mb-3 text-[11.5px] font-semibold tracking-wide text-ink-muted uppercase">Seating chart</div>
      <div className="flex flex-col gap-2">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tableCount}, minmax(0, 1fr))` }}>
          {topRow.map(cell)}
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tableCount}, minmax(0, 1fr))` }}>
          {emptyBottomSlot && <div key="empty" aria-hidden="true" />}
          {bottomRow.map(cell)}
        </div>
      </div>
      <p className="mt-3 text-[11.5px] text-ink-muted">
        Read left-to-right, then right-to-left along the bottom row — that's the seating order clockwise around the
        table.
      </p>
    </Card>
  );
}
