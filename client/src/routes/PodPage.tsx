import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePod, podFormatLabel } from "../features/pods/usePods";
import { useAddIndividualEntrant, useAddTeamEntrant, useRemoveEntrant, entrantErrorMessage } from "../features/pods/useEntrants";
import { usePlayers } from "../features/players/usePlayers";
import { useTournament } from "../features/tournaments/useTournament";
import { Button, Card, Eyebrow, FormError, ScreenDek, ScreenTitle, TextField } from "../components/ui";
import { PodTabs } from "../components/PodTabs";
import { entrantDisplayName } from "../lib/entrant";
import type { Entrant } from "../lib/types";

function alreadyEnteredPlayerIds(entrants: Entrant[]): Set<string> {
  const ids = new Set<string>();
  for (const e of entrants) {
    if (e.player) ids.add(e.player.id);
    if (e.team) for (const m of e.team.members) ids.add(m.playerId);
  }
  return ids;
}

function IndividualEntrants({ podId, entrants }: { podId: string; entrants: Entrant[] }) {
  const { data: playersData } = usePlayers();
  const addEntrant = useAddIndividualEntrant(podId);
  const removeEntrant = useRemoveEntrant(podId);
  const [selected, setSelected] = useState("");

  const taken = alreadyEnteredPlayerIds(entrants);
  const available = (playersData?.players ?? []).filter((p) => !taken.has(p.id));

  return (
    <div>
      <Card className="mb-4 divide-y divide-border">
        {entrants.length === 0 && <p className="px-5 py-4 text-[13.5px] text-ink-muted">No entrants yet.</p>}
        {entrants.map((e) => (
          <div key={e.id} className="flex items-center justify-between px-5 py-3">
            <span className="font-display text-[15px] font-bold">{entrantDisplayName(e)}</span>
            <Button variant="ghost" onClick={() => removeEntrant.mutate(e.id)}>
              Remove
            </Button>
          </div>
        ))}
      </Card>

      {available.length > 0 ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!selected) return;
            addEntrant.mutate(selected, { onSuccess: () => setSelected("") });
          }}
        >
          <select
            className="flex-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Select a player…</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
          <Button type="submit" variant="primary" disabled={!selected || addEntrant.isPending}>
            + Add entrant
          </Button>
        </form>
      ) : (
        <p className="text-[13px] text-ink-muted">
          Every roster player is already entered. Add more players on the Roster page.
        </p>
      )}
      {addEntrant.isError && <FormError>{entrantErrorMessage(addEntrant.error)}</FormError>}
    </div>
  );
}

function TeamEntrants({ podId, entrants }: { podId: string; entrants: Entrant[] }) {
  const { data: playersData } = usePlayers();
  const addTeam = useAddTeamEntrant(podId);
  const removeEntrant = useRemoveEntrant(podId);
  const [teamName, setTeamName] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);

  const taken = alreadyEnteredPlayerIds(entrants);
  const available = (playersData?.players ?? []).filter((p) => !taken.has(p.id));

  return (
    <div>
      <Card className="mb-4 divide-y divide-border">
        {entrants.length === 0 && <p className="px-5 py-4 text-[13.5px] text-ink-muted">No teams yet.</p>}
        {entrants.map((e) => (
          <div key={e.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <div className="font-display text-[15px] font-bold">{entrantDisplayName(e)}</div>
              <div className="text-[12px] text-ink-muted">{e.team?.members.map((m) => m.player.displayName).join(", ")}</div>
            </div>
            <Button variant="ghost" onClick={() => removeEntrant.mutate(e.id)}>
              Remove
            </Button>
          </div>
        ))}
      </Card>

      {available.length > 0 ? (
        <Card className="p-5">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!teamName.trim() || memberIds.length === 0) return;
              addTeam.mutate(
                { teamName: teamName.trim(), playerIds: memberIds },
                { onSuccess: () => { setTeamName(""); setMemberIds([]); } },
              );
            }}
          >
            <TextField placeholder="Team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
            <div className="flex flex-wrap gap-3">
              {available.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5 text-[13px] text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={memberIds.includes(p.id)}
                    onChange={(e) =>
                      setMemberIds((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id)))
                    }
                  />
                  {p.displayName}
                </label>
              ))}
            </div>
            <Button type="submit" variant="primary" disabled={!teamName.trim() || memberIds.length === 0 || addTeam.isPending}>
              + Add team
            </Button>
          </form>
        </Card>
      ) : (
        <p className="text-[13px] text-ink-muted">
          Every roster player is already entered. Add more players on the Roster page.
        </p>
      )}
      {addTeam.isError && <FormError>{entrantErrorMessage(addTeam.error)}</FormError>}
    </div>
  );
}

export function PodPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = usePod(id);
  const { data: tournamentData } = useTournament(data?.pod.tournamentId);

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!data) return <p className="text-ink-muted">Pod not found.</p>;

  const { pod } = data;

  return (
    <div>
      <Eyebrow>
        {tournamentData && (
          <>
            <Link to={`/tournaments/${pod.tournamentId}`} className="hover:text-accent-strong">
              {tournamentData.tournament.name}
            </Link>{" "}
            ·{" "}
          </>
        )}
        {podFormatLabel[pod.format]} · {pod.roundCount} rounds
      </Eyebrow>
      <ScreenTitle>{pod.name}</ScreenTitle>
      <ScreenDek>
        {pod.isTeamEvent
          ? `Team event — teams of ${pod.teamSize}. Assign the roster into teams before pairing round 1.`
          : "Individual entrants. Add everyone playing before pairing round 1."}
      </ScreenDek>

      <PodTabs podId={pod.id} />

      {pod.isTeamEvent ? (
        <TeamEntrants podId={pod.id} entrants={pod.entrants} />
      ) : (
        <IndividualEntrants podId={pod.id} entrants={pod.entrants} />
      )}
    </div>
  );
}
