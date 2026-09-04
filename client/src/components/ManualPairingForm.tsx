import { useState } from "react";
import { useManualPairRound, roundErrorMessage } from "../features/pods/useRounds";
import { entrantDisplayName } from "../lib/entrant";
import { Button, FormError } from "./ui";
import type { Entrant } from "../lib/types";

// Manual pairing UI: one dropdown-pair row per expected table, each side
// filtering out entrants already picked elsewhere so a duplicate is
// impossible by construction rather than caught after the fact. Backend
// (`invalid_pairing`) is still the real guard — this is just about not
// making the organizer hit it in the first place. Shared by PairingsPage
// (any round) and SeatingsPage (PI-79/80, round 1 only).
export function ManualPairingForm({
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
