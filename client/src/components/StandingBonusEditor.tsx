import type { StandingBonusRow } from "../lib/types";
import { Button, TextField } from "./ui";

// PI-72 — edits the place→bonus rows for token standing rewards. A finishing
// place gets the tokens of the first row that contains it.
export function StandingBonusEditor({
  rows,
  onChange,
}: {
  rows: StandingBonusRow[];
  onChange: (rows: StandingBonusRow[]) => void;
}) {
  const update = (i: number, patch: Partial<StandingBonusRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] tracking-wide text-ink-muted uppercase">Standing bonus (tokens by finishing place)</div>
      {rows.length === 0 && <p className="text-[12px] text-ink-muted">No standing bonus — only participation is awarded.</p>}
      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-ink-muted">Places</span>
          <TextField
            type="number"
            min={1}
            value={row.fromPlace}
            onChange={(e) => update(i, { fromPlace: Number(e.target.value) })}
            className="w-16"
          />
          <span className="text-ink-muted">to</span>
          <TextField
            type="number"
            min={row.fromPlace}
            value={row.toPlace}
            onChange={(e) => update(i, { toPlace: Number(e.target.value) })}
            className="w-16"
          />
          <span className="text-ink-muted">→</span>
          <TextField
            type="number"
            value={row.tokens}
            onChange={(e) => update(i, { tokens: Number(e.target.value) })}
            className="w-20"
          />
          <span className="text-ink-muted">tokens</span>
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
            className="text-[12px] text-ink-muted hover:text-critical"
            aria-label={`Remove row ${i + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          const nextFrom = rows.length ? Math.max(...rows.map((r) => r.toPlace)) + 1 : 1;
          onChange([...rows, { fromPlace: nextFrom, toPlace: nextFrom, tokens: 0 }]);
        }}
        className="self-start"
      >
        + Add row
      </Button>
    </div>
  );
}
