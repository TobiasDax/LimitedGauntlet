import { useState } from "react";
import { Link } from "react-router-dom";
import type { CardPull } from "../lib/types";

export function formatEur(value: number | null): string {
  return value === null ? "—" : `€${value.toFixed(2)}`;
}

// Covers two related cases with one control: confirming/correcting/
// unassigning an inferred guess, and assigning a pull that has no player
// at all (either never had one, or was just unassigned) — both need the
// same "pick from the roster" affordance, only the button set differs
// (unassign only makes sense when there's currently something to clear).
function AttributionEditor({
  pull,
  players,
  onSet,
}: {
  pull: CardPull;
  players: { id: string; name: string }[];
  onSet: (playerId: string | null) => void;
}) {
  const [selected, setSelected] = useState(pull.playerId ?? "");

  return (
    <div className="mt-1.5 flex items-center gap-1">
      {pull.playerIdInferred && (
        <span title="Guessed from finish + card value — not yet confirmed" className="text-[11px]">
          🔮
        </span>
      )}
      <select
        className="min-w-0 flex-1 rounded border border-border-strong bg-surface px-1 py-0.5 text-[10.5px] text-ink outline-none focus:border-accent"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">— unassigned —</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => onSet(selected)}
        disabled={!selected}
        title={pull.playerId ? "Confirm this attribution" : "Assign to this player"}
        className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10.5px] font-bold text-[#241c0a] hover:bg-accent-strong disabled:opacity-50"
      >
        ✓
      </button>
      {pull.playerId && (
        <button
          onClick={() => onSet(null)}
          title="Unassign — no real data to back up who pulled this"
          className="shrink-0 rounded border border-border-strong px-1.5 py-0.5 text-[10.5px] text-ink-secondary hover:bg-surface-raised hover:text-ink"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function CardGallery({
  pulls,
  onRemove,
  tournamentLinkTo,
  editableAttribution,
  attributionPlayers,
  onSetAttribution,
}: {
  pulls: CardPull[];
  onRemove?: (id: string) => void;
  // Builds the href for the small "which tournament" label — differs
  // between the authed (`/tournaments/:id`) and public
  // (`/o/:slug/tournaments/:id`) contexts, so it's a function rather
  // than a boolean.
  tournamentLinkTo?: (tournamentId: string) => string;
  // When set, an inferred (unconfirmed) or unassigned pull gets an inline
  // assign/confirm/unassign control instead of just the read-only 🔮
  // marker or nothing. Only makes sense on an authenticated,
  // organizer-editable page (PodValuePage).
  editableAttribution?: boolean;
  attributionPlayers?: { id: string; name: string }[];
  onSetAttribution?: (pullId: string, playerId: string | null) => void;
}) {
  if (pulls.length === 0) {
    return <p className="text-[13px] text-ink-muted">No pulls recorded yet.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {pulls.map((pull) => (
        <div key={pull.id} className="overflow-hidden rounded-[10px] border border-border-strong bg-surface">
          <div className="relative aspect-[5/7] bg-surface-sunken">
            {pull.imageUri ? (
              <img src={pull.imageUri} alt={pull.cardName} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="grid h-full w-full place-items-center text-[11px] text-ink-muted">No image</div>
            )}
            {pull.foil && (
              <span
                title="Foil"
                className="absolute top-1.5 left-1.5 grid h-6 w-6 place-items-center rounded bg-black/65 text-[12px]"
              >
                ✨
              </span>
            )}
            {onRemove && (
              <button
                onClick={() => onRemove(pull.id)}
                title="Remove"
                className="absolute top-1.5 right-1.5 grid h-6 w-6 place-items-center rounded bg-black/65 text-[12px] text-white hover:bg-black/85"
              >
                ✕
              </button>
            )}
          </div>
          <div className="p-2.5">
            <div className="font-display mb-1 text-[13px] leading-tight font-bold">{pull.cardName}</div>
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-bold text-accent-strong tabular-nums">{formatEur(pull.priceEur)}</span>
              {pull.setCode && (
                <span className="text-[10px] tracking-wide text-ink-muted uppercase">
                  {pull.setCode}
                  {pull.foil && " · foil"}
                </span>
              )}
            </div>
            {editableAttribution && (pull.playerIdInferred || !pull.player) && attributionPlayers && onSetAttribution ? (
              <AttributionEditor
                pull={pull}
                players={attributionPlayers}
                onSet={(playerId) => onSetAttribution(pull.id, playerId)}
              />
            ) : (
              pull.player && (
                <div className="mt-1 truncate text-[10.5px] text-ink-muted">
                  {pull.playerIdInferred && <span title="Guessed from finish + card value — not yet confirmed">🔮 </span>}
                  {pull.player.displayName}
                </div>
              )
            )}
            {tournamentLinkTo && pull.pod?.tournament && (
              <Link
                to={tournamentLinkTo(pull.pod.tournament.id)}
                className="mt-1 block truncate text-[10.5px] text-ink-muted hover:text-accent-strong"
              >
                {pull.pod.tournament.name}
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
