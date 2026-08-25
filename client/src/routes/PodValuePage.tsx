import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useAddCardPull,
  useAutocompleteCard,
  useDeleteCardPull,
  useSetCardPullAttribution,
  usePodCardPulls,
  useScryfallSets,
  cardPullErrorMessage,
} from "../features/pods/useCardPulls";
import { usePod, podFormatDisplay } from "../features/pods/usePods";
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

function AddPullForm({
  podId,
  entrants,
  defaultSetCode,
}: {
  podId: string;
  entrants: Entrant[];
  defaultSetCode: string;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [foil, setFoil] = useState(false);
  const addPull = useAddCardPull(podId);

  const { data: setsData } = useScryfallSets();
  // Server already returns these alphabetized by name. A name -> code
  // lookup so the field can be typed/searched by name while still
  // submitting the code; falls through to the raw text as-is when it
  // doesn't match any known name, so an uncommon code (e.g. a bonus-sheet
  // set not in the list at all) can still be typed directly.
  const sets = setsData?.sets ?? [];
  const codeByName = useMemo(() => new Map(sets.map((s) => [s.name.toLowerCase(), s.code])), [sets]);
  const nameByCode = useMemo(() => new Map(sets.map((s) => [s.code, s.name])), [sets]);
  const [setInput, setSetInput] = useState(() => nameByCode.get(defaultSetCode) ?? defaultSetCode);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: suggestions } = useAutocompleteCard(debouncedQuery);
  const showSuggestions = query === debouncedQuery && (suggestions?.names.length ?? 0) > 0;
  const players = pullablePlayers(entrants);

  const submit = (name: string) => {
    const trimmed = setInput.trim();
    const resolvedSetCode = trimmed ? (codeByName.get(trimmed.toLowerCase()) ?? trimmed) : undefined;
    addPull.mutate(
      { cardName: name, playerId: playerId || undefined, setCode: resolvedSetCode, foil },
      { onSuccess: () => setQuery("") },
    );
  };

  return (
    <div className="relative mb-6">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) submit(query.trim());
        }}
      >
        <TextField
          className="min-w-[180px] flex-1"
          placeholder="Card name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <TextField
          className="w-48"
          list="set-options"
          placeholder="Set…"
          title="Pick a set by name, or type a code directly (e.g. eos for a bonus sheet) — pins the printing instead of guessing. Optional."
          value={setInput}
          onChange={(e) => setSetInput(e.target.value)}
        />
        <datalist id="set-options">
          {sets.map((s) => (
            <option key={s.code} value={s.name} />
          ))}
        </datalist>
        <label className="flex items-center gap-1.5 text-[12.5px] text-ink-secondary" title="Price the foil printing">
          <input type="checkbox" checked={foil} onChange={(e) => setFoil(e.target.checked)} />
          Foil
        </label>
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
  const setAttribution = useSetCardPullAttribution(id ?? "");

  const pod = podData?.pod;
  const attributionPlayers = pullablePlayers(pod?.entrants ?? []);

  return (
    <div>
      <Eyebrow>
        <Link to={`/pods/${id}`} className="hover:text-accent-strong">
          {pod ? pod.name : "Pod"}
        </Link>
        {pod && ` · ${podFormatDisplay(pod)}`}
      </Eyebrow>
      <ScreenTitle>Value</ScreenTitle>
      <ScreenDek>Live Scryfall lookups, snapshotted at add-time — prices reflect the market when the card was logged.</ScreenDek>

      <PodTabs podId={id ?? ""} />

      {pod && <AddPullForm podId={pod.id} entrants={pod.entrants} defaultSetCode={pod.setCode ?? ""} />}

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
          <CardGallery
            pulls={data?.cardPulls ?? []}
            onRemove={(pullId) => deletePull.mutate(pullId)}
            editableAttribution
            attributionPlayers={attributionPlayers}
            onSetAttribution={(pullId, playerId) => setAttribution.mutate({ pullId, playerId })}
          />
        </>
      )}
    </div>
  );
}
