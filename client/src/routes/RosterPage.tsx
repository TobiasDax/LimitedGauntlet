import { useState } from "react";
import { useCreatePlayer, useDeletePlayer, usePlayers, useUpdatePlayer } from "../features/players/usePlayers";
import { Button, Card, Eyebrow, ScreenDek, ScreenTitle, TextField } from "../components/ui";
import type { Player } from "../lib/types";

function RosterRow({ player }: { player: Player }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.displayName);
  const update = useUpdatePlayer();
  const remove = useDeletePlayer();

  if (editing) {
    return (
      <form
        className="flex items-center gap-2 px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({ id: player.id, displayName: name }, { onSuccess: () => setEditing(false) });
        }}
      >
        <TextField value={name} onChange={(e) => setName(e.target.value)} autoFocus className="flex-1" />
        <Button type="submit" variant="primary" disabled={update.isPending}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="font-display text-[15.5px] font-bold">{player.displayName}</span>
      <div className="flex gap-1">
        <Button variant="ghost" onClick={() => setEditing(true)}>
          Rename
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`Remove ${player.displayName} from the roster?`)) remove.mutate(player.id);
          }}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

export function RosterPage() {
  const { data, isLoading } = usePlayers();
  const createPlayer = useCreatePlayer();
  const [newName, setNewName] = useState("");

  return (
    <div>
      <Eyebrow>Your organization</Eyebrow>
      <ScreenTitle>Roster</ScreenTitle>
      <ScreenDek>Players persist across every tournament your group runs — add them once here.</ScreenDek>

      {isLoading && <p className="text-ink-muted">Loading…</p>}

      {data && data.players.length > 0 && (
        <Card className="mb-4 divide-y divide-border">
          {data.players.map((p) => (
            <RosterRow key={p.id} player={p} />
          ))}
        </Card>
      )}

      <Card className="p-5">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            createPlayer.mutate(newName.trim(), { onSuccess: () => setNewName("") });
          }}
        >
          <TextField
            className="flex-1"
            placeholder="Player name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={createPlayer.isPending}>
            + Add player
          </Button>
        </form>
      </Card>
    </div>
  );
}
