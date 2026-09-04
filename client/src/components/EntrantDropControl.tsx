import { useDropEntrant, useUndropEntrant, entrantErrorMessage } from "../features/pods/useEntrants";
import { Button, FormError } from "./ui";
import type { Entrant } from "../lib/types";

// Drop/undrop toggle + "Dropped" badge (PI-63) — shared by PodPage's
// individual/team entrant lists and PairingsPage (PI-78's between-rounds
// case). Disabled while a round is active/pending; the title attribute
// explains why rather than hiding the control outright.
export function EntrantDropControl({
  podId,
  entrant,
  canModifyRoster,
}: {
  podId: string;
  entrant: Entrant;
  canModifyRoster: boolean;
}) {
  const dropEntrant = useDropEntrant(podId);
  const undropEntrant = useUndropEntrant(podId);
  const dropped = entrant.droppedAfterRound !== null;
  const pending = dropped ? undropEntrant.isPending : dropEntrant.isPending;

  return (
    <div className="flex items-center gap-3">
      {dropped && <span className="text-[12px] tracking-wide text-ink-muted uppercase">Dropped</span>}
      <Button
        variant="ghost"
        disabled={!canModifyRoster || pending}
        title={canModifyRoster ? undefined : "Finish the current round before changing who's dropped."}
        onClick={() => (dropped ? undropEntrant.mutate(entrant.id) : dropEntrant.mutate(entrant.id))}
      >
        {dropped ? "Un-drop" : "Drop"}
      </Button>
      {(dropEntrant.isError || undropEntrant.isError) && (
        <FormError>{entrantErrorMessage(dropEntrant.error ?? undropEntrant.error)}</FormError>
      )}
    </div>
  );
}
