import { useState } from "react";
import type { Pod } from "../lib/types";
import { useCountdown } from "../lib/useCountdown";
import { useClearPrepTimer, useSetPrepTimer } from "../features/pods/usePods";
import { Button, TextField } from "./ui";

const DEFAULT_MINUTES = 50;

// Read-only display of a pod's standalone pre-round timer (PI-33). Renders
// nothing when no timer is set. Used on the public pod page and the Pairings
// tab (so it shows on a shared screen), and reused inside the editable control
// below. Ticks client-side off `prepTimerEndsAt` via useCountdown.
export function PrepTimerDisplay({
  endsAt,
  label,
  size = "normal",
}: {
  endsAt: string | null;
  label: string | null;
  size?: "normal" | "large";
}) {
  const countdown = useCountdown(endsAt);
  if (!endsAt) return null;

  const big = size === "large";
  return (
    <div className="mb-6 rounded-md border border-border bg-surface px-5 py-4">
      <div className="text-[11px] tracking-wide text-ink-muted uppercase">{label || "Prep timer"}</div>
      <div
        className={`font-display font-bold tabular-nums ${
          countdown.expired ? "text-accent-strong" : "text-ink"
        } ${big ? "text-[64px] leading-none" : "text-[34px] leading-tight"}`}
      >
        {countdown.expired ? "0:00" : countdown.formatted}
      </div>
      {countdown.expired && <div className="text-[12px] font-semibold tracking-wide text-accent uppercase">Time's up</div>}
    </div>
  );
}

// Organizer control (PodPage) — start/replace or stop the pre-round timer, with
// the live display when one is running. Length is configurable (default 50 min).
export function PrepTimer({ pod }: { pod: Pod }) {
  const setTimer = useSetPrepTimer(pod.id);
  const clearTimer = useClearPrepTimer(pod.id);
  const [minutes, setMinutes] = useState(String(DEFAULT_MINUTES));
  const [label, setLabel] = useState("");

  const active = !!pod.prepTimerEndsAt;

  if (active) {
    return (
      <div className="mb-6">
        <PrepTimerDisplay endsAt={pod.prepTimerEndsAt} label={pod.prepTimerLabel} />
        <div className="-mt-3 flex gap-2">
          <Button variant="ghost" onClick={() => clearTimer.mutate()} disabled={clearTimer.isPending}>
            Stop timer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-md border border-border bg-surface px-5 py-4">
      <div className="mb-2 text-[11px] tracking-wide text-ink-muted uppercase">Pre-round timer</div>
      <p className="mb-3 max-w-lg text-[13px] text-ink-secondary">
        A standalone timer for draft / deck-building, before any round is paired. Shows live on every device, including
        the public link.
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const m = Number(minutes);
          if (!Number.isFinite(m) || m < 1) return;
          setTimer.mutate(
            { minutes: Math.floor(m), label: label.trim() || undefined },
            { onSuccess: () => setLabel("") },
          );
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[11px] tracking-wide text-ink-muted uppercase">Minutes</span>
          <TextField
            type="number"
            min={1}
            max={600}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-24"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] tracking-wide text-ink-muted uppercase">Label (optional)</span>
          <TextField
            placeholder="Draft, Deck-building…"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <Button type="submit" variant="primary" disabled={setTimer.isPending}>
          {setTimer.isPending ? "Starting…" : "Start timer"}
        </Button>
      </form>
    </div>
  );
}
