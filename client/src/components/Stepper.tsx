// Compact [−] value [+] control (PI-53) for a bounded 0..N game count — the
// number stays a real, still-typable input between the buttons rather than a
// locked display, so a quick tap-tap works at the table but typing a value
// directly (or pasting a correction) still works too. Shared by the organizer
// Pairings page and the player self-report portal (PI-52).
export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  ariaLabel,
  title,
  dashed,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  ariaLabel: string;
  title?: string;
  dashed?: boolean;
  className?: string;
}) {
  const clamp = (n: number) => Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, n));
  return (
    <div
      className={`flex items-center rounded border ${dashed ? "border-dashed" : ""} border-border-strong bg-surface ${className ?? ""}`}
      title={title}
    >
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        aria-label={`Decrease ${ariaLabel}`}
        className="px-3.5 py-2.5 text-base text-ink-muted hover:text-accent-strong disabled:opacity-30 disabled:hover:text-ink-muted"
      >
        −
      </button>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        aria-label={ariaLabel}
        className="min-w-10 flex-1 border-none bg-transparent text-center text-base tabular-nums text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={max !== undefined && value >= max}
        aria-label={`Increase ${ariaLabel}`}
        className="px-3.5 py-2.5 text-base text-ink-muted hover:text-accent-strong disabled:opacity-30 disabled:hover:text-ink-muted"
      >
        +
      </button>
    </div>
  );
}
