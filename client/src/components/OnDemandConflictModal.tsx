import { Button, Modal } from "./ui";
import type { OnDemandConflict } from "../lib/types";

// PI-100 — shown when generating an on-demand pod's round 1 would pull entrants
// out of other not-yet-started on-demand pods. The organizer picks: withdraw
// them (the expected path — they're about to be busy playing), keep them (start
// this pod, touch nothing else), or cancel (don't start round 1 at all).
export function OnDemandConflictModal({
  conflicts,
  pending,
  onWithdraw,
  onKeep,
  onClose,
}: {
  conflicts: OnDemandConflict[];
  pending: boolean;
  onWithdraw: () => void;
  onKeep: () => void;
  onClose: () => void;
}) {
  // Group by the pod the entrants would be withdrawn from.
  const byPod = new Map<string, { podName: string; rows: OnDemandConflict[] }>();
  for (const c of conflicts) {
    const entry = byPod.get(c.podId) ?? { podName: c.podName, rows: [] };
    entry.rows.push(c);
    byPod.set(c.podId, entry);
  }

  return (
    <Modal title="These players are in other on-demand pods" onClose={onClose}>
      <p className="mb-4 text-[13px] text-ink-secondary">
        Starting this pod means these players are busy. Withdraw them from the other on-demand pods that haven&apos;t
        started yet?
      </p>
      <div className="mb-5 flex flex-col gap-3">
        {[...byPod.values()].map((pod) => (
          <div key={pod.podName} className="rounded-md border border-border bg-surface-sunken px-3 py-2.5">
            <div className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{pod.podName}</div>
            <ul className="mt-1 flex flex-col gap-0.5 text-[13px]">
              {pod.rows.map((c) => (
                <li key={c.entrantId}>
                  {c.displayName}
                  {c.kind === "team" && (
                    <span className="text-ink-muted">
                      {" "}
                      — removes the whole team{c.memberNames?.length ? ` (${c.memberNames.join(", ")})` : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={pending} onClick={onWithdraw}>
          {pending ? "Working…" : "Withdraw them"}
        </Button>
        <Button variant="default" disabled={pending} onClick={onKeep}>
          Keep them on the other pods
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
