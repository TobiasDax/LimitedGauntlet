import { useState } from "react";
import {
  useCreatePlayer,
  useDeletePlayer,
  useInvitePlayer,
  usePlayers,
  useRevokePlayerAccount,
  useUpdatePlayer,
} from "../features/players/usePlayers";
import { useMe } from "../features/auth/useAuth";
import { ApiError } from "../lib/api";
import { Button, Card, Eyebrow, FormError, ScreenDek, ScreenTitle, TextField } from "../components/ui";
import type { Player } from "../lib/types";

const norm = (s: string) => s.trim().toLowerCase();

// PI-52 — the per-row "player account" affordance: invite by email, show a
// pending state with a copyable link (works even with no SMTP), or revoke.
function AccountControls({ player, orgSlug }: { player: Player; orgSlug: string | undefined }) {
  const invite = useInvitePlayer();
  const revoke = useRevokePlayerAccount();
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);

  if (player.hasAccount) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[11px] tracking-wide text-good uppercase">Has login</span>
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`Revoke ${player.displayName}'s player login?`)) revoke.mutate(player.id);
          }}
        >
          Revoke
        </Button>
      </div>
    );
  }

  if (link) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-[11px] tracking-wide text-ink-muted uppercase">Invite link — send to player</span>
        <div className="flex gap-1">
          <TextField readOnly value={link} className="w-64 text-[12px]" onFocus={(e) => e.currentTarget.select()} />
          <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(link)}>
            Copy
          </Button>
        </div>
      </div>
    );
  }

  if (player.pendingInvite || showForm) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim()) return;
          invite.mutate(
            { id: player.id, email: email.trim() },
            { onSuccess: (res) => setLink(res.acceptUrl) },
          );
        }}
      >
        <TextField
          type="email"
          placeholder="player@email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-48"
          autoFocus
        />
        <Button type="submit" variant="primary" disabled={invite.isPending}>
          {player.pendingInvite ? "Re-send" : "Send invite"}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] tracking-wide text-ink-muted uppercase">No login</span>
      <Button variant="ghost" onClick={() => setShowForm(true)} disabled={!orgSlug}>
        Invite
      </Button>
    </div>
  );
}

function RosterRow({
  player,
  orgSlug,
  nameTaken,
}: {
  player: Player;
  orgSlug: string | undefined;
  nameTaken: (name: string, exceptId: string) => boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.displayName);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdatePlayer();
  const remove = useDeletePlayer();

  if (editing) {
    return (
      <form
        className="flex flex-col gap-2 px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          const next = name.trim();
          if (!next) return;
          if (nameTaken(next, player.id)) {
            setError(`Another player is already named "${next}". Roster names have to be unique.`);
            return;
          }
          update.mutate(
            { id: player.id, displayName: next },
            {
              onSuccess: () => setEditing(false),
              onError: (err) =>
                setError(
                  err instanceof ApiError && err.message === "name_taken"
                    ? `Another player is already named "${next}". Roster names have to be unique.`
                    : "Couldn't save that. Try again.",
                ),
            },
          );
        }}
      >
        <div className="flex items-center gap-2">
          <TextField
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            autoFocus
            className="flex-1"
          />
          <Button type="submit" variant="primary" disabled={update.isPending}>
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setName(player.displayName);
              setError(null);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
        {error && <FormError>{error}</FormError>}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
      <span className="font-display text-[15.5px] font-bold">{player.displayName}</span>
      <div className="flex flex-wrap items-center gap-1">
        <AccountControls player={player} orgSlug={orgSlug} />
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
  const { data: me } = useMe();
  const createPlayer = useCreatePlayer();
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Roster names must be unique within the org (case-insensitively) — a
  // duplicate splits standings and mis-attributes results. Blocked here off the
  // already-loaded list; the backend enforces it too (`name_taken`).
  const players = data?.players ?? [];
  const nameTaken = (name: string, exceptId?: string) =>
    players.some((p) => p.id !== exceptId && norm(p.displayName) === norm(name));

  const submit = () => {
    const next = newName.trim();
    if (!next) return;
    if (nameTaken(next)) {
      setError(`"${next}" is already on the roster. Roster names have to be unique — pick a different one.`);
      return;
    }
    createPlayer.mutate(next, {
      onSuccess: () => {
        setNewName("");
        setError(null);
      },
      onError: (err) =>
        setError(
          err instanceof ApiError && err.message === "name_taken"
            ? `"${next}" is already on the roster. Roster names have to be unique — pick a different one.`
            : "Couldn't add that player. Try again.",
        ),
    });
  };

  return (
    <div>
      <Eyebrow>Your organization</Eyebrow>
      <ScreenTitle>Roster</ScreenTitle>
      <ScreenDek>
        Players persist across every tournament your group runs — add them once here. Invite a player to
        a login and they can check themselves in and report their own results at{" "}
        <code className="text-[13px]">/o/{me?.organization.slug ?? "…"}/player</code>.
      </ScreenDek>

      {isLoading && <p className="text-ink-muted">Loading…</p>}

      {data && data.players.length > 0 && (
        <Card className="mb-4 divide-y divide-border">
          {data.players.map((p) => (
            <RosterRow key={p.id} player={p} orgSlug={me?.organization.slug} nameTaken={nameTaken} />
          ))}
        </Card>
      )}

      <Card className="p-5">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TextField
            className="flex-1"
            placeholder="Player name"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setError(null);
            }}
          />
          <Button type="submit" variant="primary" disabled={createPlayer.isPending}>
            + Add player
          </Button>
        </form>
        {error && (
          <div className="mt-3">
            <FormError>{error}</FormError>
          </div>
        )}
      </Card>
    </div>
  );
}
