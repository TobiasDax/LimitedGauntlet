import { useState } from "react";
import { suggestTableShape, validateTableShape, MIN_TABLE_SIZE } from "../lib/tableShape";
import { Button } from "./ui";

// PI-115 — lets the TO choose between one big table (today's behavior) or
// splitting a large draft/chaos-draft pod's round 1 across multiple physical
// tables, before pairing/seatings exist. Deliberately shape-only: there's no
// per-entrant assignment here, just how many tables and how big each one is
// (see ROADMAP PI-115 — "rebalance" never touches which entrant lands where,
// only the numbers). Reports `undefined` (one big table) or a validated
// `number[]` up to the caller via onChange.
export function TableShapeForm({
  entrantCount,
  onChange,
}: {
  entrantCount: number;
  onChange: (tableSizes: number[] | undefined) => void;
}) {
  const [split, setSplit] = useState(false);
  const [sizes, setSizes] = useState<number[]>(() => suggestTableShape(entrantCount));

  const update = (next: number[]) => {
    setSizes(next);
    onChange(split ? next : undefined);
  };

  const toggle = (next: boolean) => {
    setSplit(next);
    onChange(next ? sizes : undefined);
  };

  const error = split ? validateTableShape(entrantCount, sizes) : null;
  const total = sizes.reduce((a, b) => a + b, 0);

  return (
    <div className="mb-5 rounded-lg border border-border bg-surface-sunken p-4">
      <div className="mb-3 text-[11.5px] font-semibold tracking-wide text-ink-muted uppercase">Table layout</div>
      <div className="mb-3 flex items-center gap-2">
        <Button variant={split ? "ghost" : "primary"} onClick={() => toggle(false)}>
          One big table
        </Button>
        <Button variant={split ? "primary" : "ghost"} onClick={() => toggle(true)}>
          Split into tables
        </Button>
      </div>

      {split && (
        <>
          <div className="flex flex-col gap-2">
            {sizes.map((size, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[11px] tracking-wide text-ink-muted uppercase">Table {i + 1}</span>
                <input
                  type="number"
                  min={MIN_TABLE_SIZE}
                  value={size}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    update(sizes.map((s, idx) => (idx === i ? (Number.isNaN(n) ? 0 : n) : s)));
                  }}
                  className="w-20 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
                />
                <span className="text-[11.5px] text-ink-muted">players</span>
                {sizes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => update(sizes.filter((_, idx) => idx !== i))}
                    className="text-[12px] text-ink-secondary underline hover:text-critical"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => update([...sizes, MIN_TABLE_SIZE])}
              className="text-[12.5px] text-ink-secondary underline hover:text-accent-strong"
            >
              Add table
            </button>
            <span className="text-[12px] text-ink-muted">
              {total} of {entrantCount} players placed
            </span>
          </div>
          {error === "table_too_small" && (
            <p className="mt-2 text-[12px] text-critical">Every table needs at least {MIN_TABLE_SIZE} players.</p>
          )}
          {error === "size_mismatch" && (
            <p className="mt-2 text-[12px] text-critical">Table sizes need to add up to all {entrantCount} entrants.</p>
          )}
        </>
      )}
    </div>
  );
}
