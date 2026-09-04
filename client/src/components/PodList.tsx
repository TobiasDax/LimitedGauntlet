import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "./ui";
import { podFormatDisplay, podProgressStatus } from "../features/pods/usePods";
import { sortForDisplay, partitionFinished, groupByDate, distinctDateCount, swapPodOrder } from "../lib/podOrder";
import type { Pod } from "../lib/types";

function dateDividerLabel(isoDate: string): string {
  // Pod.date is date-only in intent (an <input type="date"> value, always
  // midnight UTC) — parse just the YYYY-MM-DD prefix as a local calendar
  // date so the label doesn't shift a day depending on the viewer's timezone.
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

interface PodRowProps {
  pod: Pod;
  href: string;
  reorder?: { isFirst: boolean; isLast: boolean; onUp: () => void; onDown: () => void; pending: boolean };
}

function PodRow({ pod, href, reorder }: PodRowProps) {
  return (
    <Card className="flex items-center gap-3 px-5 py-4">
      {reorder && (
        <div className="flex flex-col gap-1">
          <button
            onClick={reorder.onUp}
            disabled={reorder.isFirst || reorder.pending}
            title="Move up"
            className="grid h-6 w-6 place-items-center rounded border border-border-strong text-[11px] text-ink-secondary hover:text-ink disabled:opacity-30"
          >
            ▲
          </button>
          <button
            onClick={reorder.onDown}
            disabled={reorder.isLast || reorder.pending}
            title="Move down"
            className="grid h-6 w-6 place-items-center rounded border border-border-strong text-[11px] text-ink-secondary hover:text-ink disabled:opacity-30"
          >
            ▼
          </button>
        </div>
      )}
      <Link to={href} className="flex flex-1 items-center justify-between gap-3 transition-colors hover:opacity-80">
        <div>
          <div className="font-display text-[16px] font-bold">
            {pod.isMainEvent && <span title="This tournament's main event">👑 </span>}
            {pod.name}
          </div>
          <div className="text-[12.5px] text-ink-muted">
            {podFormatDisplay(pod)}
            {pod.isTeamEvent && ` · teams of ${pod.teamSize}`} · {pod.roundCount} rounds
            {pod.date && ` · ${pod.date.slice(0, 10)}${pod.startTime ? ` ${pod.startTime}` : ""}`}
          </div>
        </div>
        <span className="shrink-0 text-[11.5px] tracking-wide text-ink-secondary uppercase">
          {podProgressStatus(pod)}
        </span>
      </Link>
    </Card>
  );
}

interface PodGroupProps {
  pods: Pod[];
  podHref: (pod: Pod) => string;
  showDateDividers: boolean;
  reorder?: {
    pending: boolean;
    onSwap: (aId: string, bId: string) => void;
  };
}

// Renders one already-partitioned group (the unfinished set, or the finished
// set) of pods — date dividers only apply to the unfinished group (PI-83),
// callers pass showDateDividers accordingly.
function PodGroup({ pods, podHref, showDateDividers, reorder }: PodGroupProps) {
  const rows = (list: Pod[]) =>
    list.map((pod, i) => (
      <PodRow
        key={pod.id}
        pod={pod}
        href={podHref(pod)}
        reorder={
          reorder && {
            isFirst: i === 0,
            isLast: i === list.length - 1,
            pending: reorder.pending,
            onUp: () => reorder.onSwap(pod.id, list[i - 1]!.id),
            onDown: () => reorder.onSwap(pod.id, list[i + 1]!.id),
          }
        }
      />
    ));

  if (!showDateDividers || distinctDateCount(pods) <= 1) {
    return <div className="flex flex-col gap-2">{rows(pods)}</div>;
  }

  const groups = groupByDate(pods);
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group, gi) => (
        <div key={group.date ?? `unscheduled-${gi}`} className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
            {group.date ? dateDividerLabel(group.date) : "Unscheduled"}
          </div>
          {rows(group.pods)}
        </div>
      ))}
    </div>
  );
}

export interface PodListProps {
  podsManuallyReordered: boolean;
  pods: Pod[];
  podHref: (pod: Pod) => string;
  // Present only on the organizer's own tournament page — the public page
  // renders the identical order/grouping read-only.
  reorder?: {
    onReorder: (podIds: string[]) => void;
    pending: boolean;
  };
}

const tabs = [
  { key: "scheduled", label: "Scheduled" },
  { key: "onDemand", label: "On demand" },
] as const;
type TabKey = (typeof tabs)[number]["key"];

// PI-76/77/81/82/83/84 — the whole pod-list rendering, shared between
// TournamentPage (organizer, with reorder) and PublicTournamentPage
// (read-only): Scheduled/On-demand tabs, unfinished pods first (date-divided,
// auto-sorted by date/time until manually reordered) then a "Finished"
// group (completed + canceled, sunk to the bottom, sorted by completion
// order) — see lib/podOrder.ts for the actual sort/partition rules.
export function PodList({ podsManuallyReordered, pods, podHref, reorder }: PodListProps) {
  const [tab, setTab] = useState<TabKey>("scheduled");

  if (pods.length === 0) return null;

  const ordered = sortForDisplay(pods, podsManuallyReordered);
  const tabPods = ordered.filter((p) => (tab === "onDemand" ? p.isOnDemand : !p.isOnDemand));
  const { unfinished, finished } = partitionFinished(tabPods);

  return (
    <div className="mb-6">
      <div className="mb-3 flex gap-1 border-b border-border text-[12.5px] tracking-wide uppercase">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 ${tab === t.key ? "border-b-2 border-accent font-semibold text-ink" : "text-ink-muted hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {unfinished.length === 0 && finished.length === 0 ? (
        <p className="text-[13px] text-ink-muted">
          {tab === "onDemand" ? "No on-demand pods this weekend." : "No scheduled pods yet."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <PodGroup
            pods={unfinished}
            podHref={podHref}
            showDateDividers
            reorder={
              reorder && {
                pending: reorder.pending,
                onSwap: (aId, bId) => reorder.onReorder(swapPodOrder(pods, podsManuallyReordered, aId, bId)),
              }
            }
          />
          {finished.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                <span className="h-px flex-1 bg-border" />
                Finished
                <span className="h-px flex-1 bg-border" />
              </div>
              <PodGroup pods={finished} podHref={podHref} showDateDividers={false} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
