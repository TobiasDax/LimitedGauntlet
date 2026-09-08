import { Link } from "react-router-dom";
import { podFormatLabel, podProgressStatus } from "../features/pods/usePods";
import { Card } from "./ui";
import type { PlayerPodEntry } from "../lib/types";

function ordinal(n: number): string {
  const rem100 = n % 100;
  const rem10 = n % 10;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  if (rem10 === 1) return `${n}st`;
  if (rem10 === 2) return `${n}nd`;
  if (rem10 === 3) return `${n}rd`;
  return `${n}th`;
}

function PodHistoryRow({ entry, linkTo }: { entry: PlayerPodEntry; linkTo: string }) {
  const status = podProgressStatus(entry);
  const done = status === "Finished" || status === "Canceled";

  return (
    <Card className="flex items-center justify-between gap-3 px-5 py-3">
      <Link to={linkTo} className="min-w-0 flex-1 hover:opacity-80">
        <div className="font-display truncate text-[15px] font-bold">{entry.podName}</div>
        <div className="text-[12px] text-ink-muted">
          {entry.tournamentName} · {podFormatLabel[entry.format]}
          {entry.date && ` · ${entry.date.slice(0, 10)}`}
        </div>
      </Link>
      {done && entry.finish !== null && (
        <span
          className={`font-display shrink-0 text-[14px] font-bold tabular-nums ${entry.finish === 1 ? "text-accent-strong" : "text-ink-secondary"}`}
        >
          {ordinal(entry.finish)}
        </span>
      )}
      {status === "Canceled" && (
        <span className="shrink-0 text-[11px] tracking-wide text-ink-secondary uppercase">Canceled</span>
      )}
    </Card>
  );
}

export interface PlayerPodHistoryProps {
  pods: PlayerPodEntry[];
  podLinkTo: (entry: PlayerPodEntry) => string;
}

export function PlayerPodHistory({ pods, podLinkTo }: PlayerPodHistoryProps) {
  if (pods.length === 0) return null;

  const active = pods.filter((p) => {
    const s = podProgressStatus(p);
    return s === "Setup" || s === "In progress";
  });

  const finished = pods
    .filter((p) => {
      const s = podProgressStatus(p);
      return s === "Finished" || s === "Canceled";
    })
    .slice()
    .sort((a, b) => {
      // Newest first — sort by completion/cancellation date descending.
      const aTs = a.completedAt ?? a.canceledAt;
      const bTs = b.completedAt ?? b.canceledAt;
      if (!aTs && !bTs) return 0;
      if (!aTs) return 1;
      if (!bTs) return -1;
      return bTs.localeCompare(aTs);
    });

  return (
    <div className="mt-8">
      <h2 className="font-display mb-4 text-[20px] font-bold">Events</h2>

      {active.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
            Upcoming & in progress
          </div>
          <div className="flex flex-col gap-2">
            {active.map((entry) => (
              <PodHistoryRow key={entry.podId} entry={entry} linkTo={podLinkTo(entry)} />
            ))}
          </div>
        </div>
      )}

      {finished.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Finished</div>
          <div className="flex flex-col gap-2">
            {finished.map((entry) => (
              <PodHistoryRow key={entry.podId} entry={entry} linkTo={podLinkTo(entry)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
