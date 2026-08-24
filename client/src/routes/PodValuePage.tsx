import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useAddCardPull,
  useAutocompleteCard,
  useDeleteCardPull,
  usePodCardPulls,
  cardPullErrorMessage,
} from "../features/pods/useCardPulls";
import { usePod, podFormatLabel } from "../features/pods/usePods";
import { CardGallery, formatEur } from "../components/CardGallery";
import { Button, Eyebrow, FormError, ScreenDek, ScreenTitle, TextField } from "../components/ui";
import { PodTabs } from "../components/PodTabs";
import type { Entrant } from "../lib/types";

// Flat (id, name) list of the real players behind a pod's entrants —
// individual entrants directly, team entrants resolved to their members —
// so "who pulled this" can attribute a card to a person even in a team
// pod, not just to the team as a whole.
function pullablePlayers(entrants: Entrant[]): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  for (const e of entrants) {
    if (e.player) out.push({ id: e.player.id, name: e.player.displayName });
    else if (e.team) for (const m of e.team.members) out.push({ id: m.playerId, name: m.player.displayName });
  }
  return out;
}

function AddPullForm({ podId, entrants }: { podId: string; entrants: Entrant[] }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [playerId, setPlayerId] = useState("");
  const addPull = useAddCardPull(podId);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: suggestions } = useAutocompleteCard(debouncedQuery);
  const showSuggestions = query === debouncedQuery && (suggestions?.names.length ?? 0) > 0;
  const players = pullablePlayers(entrants);

  const submit = (name: string) => {
    addPull.mutate({ cardName: name, playerId: playerId || undefined }, { onSuccess: () => setQuery("") });
  };

  return (
    <div className="relative mb-6">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) submit(query.trim());
        }}
      >
        <TextField
          className="flex-1"
          placeholder="Card name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {players.length > 0 && (
          <select
            className="rounded-md border border-border-strong bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            title="Pulled by (optional) — feeds the Hall of Fame's value stats"
          >
            <option value="">Pulled by…</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" variant="primary" disabled={!query.trim() || addPull.isPending}>
          {addPull.isPending ? "Looking up…" : "+ Add pull"}
        </Button>
      </form>
      {showSuggestions && (
        <div className="absolute z-10 mt-1 max-h-64 w-[calc(100%-100px)] overflow-y-auto rounded-md border border-border-strong bg-surface-raised shadow-lg">
          {suggestions!.names.slice(0, 8).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => submit(name)}
              className="block w-full px-3 py-2 text-left text-[13px] hover:bg-surface"
            >
              {name}
            </button>
          ))}
        </div>
      )}
      {addPull.isError && <FormError>{cardPullErrorMessage(addPull.error)}</FormError>}
    </div>
  );
}

export function PodValuePage() {
  const { id } = useParams<{ id: string }>();
  const { data: podData } = usePod(id);
  const { data, isLoading } = usePodCardPulls(id);
  const deletePull = useDeleteCardPull(id ?? "");

  const pod = podData?.pod;

  return (
    <div>
      <Eyebrow>
        <Link to={`/pods/${id}`} className="hover:text-accent-strong">
          {pod ? pod.name : "Pod"}
        </Link>
        {pod && ` · ${podFormatLabel[pod.format]}`}
      </Eyebrow>
      <ScreenTitle>Value</ScreenTitle>
      <ScreenDek>Live Scryfall lookups, snapshotted at add-time — prices reflect the market when the card was logged.</ScreenDek>

      <PodTabs podId={id ?? ""} />

      {id && <AddPullForm podId={id} entrants={pod?.entrants ?? []} />}

      {isLoading ? (
        <p className="text-ink-muted">Loading…</p>
      ) : (
        <>
          <div className="mb-4 flex items-baseline gap-2">
            <span className="font-display text-[24px] font-bold text-accent-strong tabular-nums">
              {formatEur(data?.total ?? 0)}
            </span>
            <span className="text-[11px] tracking-wide text-ink-muted uppercase">pod total</span>
          </div>
          <CardGallery pulls={data?.cardPulls ?? []} onRemove={(pullId) => deletePull.mutate(pullId)} />
        </>
      )}
    </div>
  );
}
