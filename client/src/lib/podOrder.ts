import type { Pod } from "./types";

// Shared pod-list ordering logic (PI-76/77/81/82/83/84) — one place for the
// sort/partition/group rules so TournamentPage (organizer) and
// PublicTournamentPage (read-only) render the identical order.

type OrderablePod = Pick<Pod, "id" | "sequenceOrder" | "date" | "startTime" | "isOnDemand" | "completedAt" | "canceledAt">;

// Before PI-76's reorder has ever been used (Tournament.podsManuallyReordered
// === false), the unfinished list auto-sorts by scheduled date, then time —
// undated pods sort after every dated one, by sequenceOrder among themselves
// (creation order, the only signal they have). Once the organizer reorders
// once, sequenceOrder alone is authoritative from then on (PI-82).
export function sortForDisplay<T extends OrderablePod>(pods: T[], manuallyReordered: boolean): T[] {
  const sorted = [...pods];
  if (manuallyReordered) {
    sorted.sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    return sorted;
  }
  sorted.sort((a, b) => {
    if (a.date && b.date) {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      return (a.startTime ?? "").localeCompare(b.startTime ?? "");
    }
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return a.sequenceOrder - b.sequenceOrder;
  });
  return sorted;
}

// PI-77/84: unfinished vs finished (completed or canceled), the latter sorted
// by whichever of canceledAt/completedAt applies — canceledAt takes priority
// when a pod somehow has both (e.g. finished, then canceled after the fact
// to correct a mistake), since cancellation is the more recent deciding event.
export function partitionFinished<T extends OrderablePod>(pods: T[]): { unfinished: T[]; finished: T[] } {
  const unfinished = pods.filter((p) => !p.completedAt && !p.canceledAt);
  const finished = pods
    .filter((p) => p.completedAt || p.canceledAt)
    .sort((a, b) => (a.canceledAt ?? a.completedAt ?? "").localeCompare(b.canceledAt ?? b.completedAt ?? ""));
  return { unfinished, finished };
}

export interface DateGroup<T> {
  date: string | null; // null = the trailing "Unscheduled" group
  pods: T[];
}

// PI-83: groups already-sorted pods by date, preserving incoming order
// within and across groups. Caller decides whether to actually render
// dividers (only worth it once there's more than one distinct date).
export function groupByDate<T extends OrderablePod>(pods: T[]): DateGroup<T>[] {
  const groups: DateGroup<T>[] = [];
  for (const pod of pods) {
    const key = pod.date ?? null;
    const last = groups[groups.length - 1];
    if (last && last.date === key) last.pods.push(pod);
    else groups.push({ date: key, pods: [pod] });
  }
  return groups;
}

export function distinctDateCount<T extends OrderablePod>(pods: T[]): number {
  return new Set(pods.map((p) => p.date).filter((d): d is string => !!d)).size;
}

// PI-76 — used by the pod-list up/down arrows. `allPods` is the tournament's
// full pod set (every tab, finished and unfinished); base the array to swap
// within on whatever's *currently displayed* (still date/time-sorted before
// the first-ever reorder, per `manuallyReordered`) rather than forcing
// sequenceOrder — otherwise the very first arrow click, made against a
// date-sorted list, would silently swap against a different, invisible
// sequenceOrder-based order instead of the neighbor the organizer actually
// clicked next to. Swapping two arbitrary entries by id and re-indexing
// preserves every other pod's relative order untouched, even though the two
// swapped pods may not be adjacent in the full array (they're only adjacent
// within whatever filtered/sorted subset the arrows were clicked in).
export function swapPodOrder<T extends OrderablePod>(allPods: T[], manuallyReordered: boolean, aId: string, bId: string): string[] {
  const ordered = sortForDisplay(allPods, manuallyReordered).map((p) => p.id);
  const i = ordered.indexOf(aId);
  const j = ordered.indexOf(bId);
  if (i === -1 || j === -1) return ordered;
  [ordered[i], ordered[j]] = [ordered[j] as string, ordered[i] as string];
  return ordered;
}
