import { useState } from "react";
import { ApiError } from "../../lib/api";
import type { OnDemandConflict } from "../../lib/types";

// PI-100 — shared plumbing for the "starting this on-demand pod pulls players
// out of other on-demand pods" confirm modal. A plain generate/manual-pair
// click sends no resolution; if the server 409s with `on_demand_conflicts`,
// `catchConflicts` surfaces the list so the caller renders <OnDemandConflictModal>,
// whose Withdraw / Keep buttons retry the same mutation with a resolution.

export function parseOnDemandConflicts(err: unknown): OnDemandConflict[] | null {
  if (
    err instanceof ApiError &&
    err.status === 409 &&
    typeof err.body === "object" &&
    err.body !== null &&
    (err.body as { error?: unknown }).error === "on_demand_conflicts"
  ) {
    const conflicts = (err.body as { conflicts?: unknown }).conflicts;
    return Array.isArray(conflicts) ? (conflicts as OnDemandConflict[]) : [];
  }
  return null;
}

export interface OnDemandStartGuard {
  conflicts: OnDemandConflict[] | null;
  // Use as a mutation's onError: stashes a conflict list into state and returns
  // true (so the caller can skip its normal error handling); returns false for
  // any other error, which the caller should surface as usual.
  catchConflicts: (err: unknown) => boolean;
  clear: () => void;
}

export function useOnDemandStartGuard(): OnDemandStartGuard {
  const [conflicts, setConflicts] = useState<OnDemandConflict[] | null>(null);
  return {
    conflicts,
    catchConflicts: (err) => {
      const parsed = parseOnDemandConflicts(err);
      if (parsed) {
        setConflicts(parsed);
        return true;
      }
      return false;
    },
    clear: () => setConflicts(null),
  };
}
