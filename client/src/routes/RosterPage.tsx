import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useAnonymisePlayer,
  useCreatePlayer,
  useDeletePlayer,
  useDownloadPlayerData,
  useInvitePlayer,
  usePlayers,
  useRevokePlayerAccount,
  useSetPlayerPublicHidden,
  useUpdatePlayer,
} from "../features/players/usePlayers";
import { useMe } from "../features/auth/useAuth";
import { ApiError } from "../lib/api";
import {
  Button,
  Card,
  Eyebrow,
  FormError,
  Modal,
  ScreenDek,
  ScreenTitle,
  StatusPill,
  TextField,
} from "../components/ui";
import { SharePopup } from "../components/SharePopup";
import type { Player } from "../lib/types";

const norm = (s: string) => s.trim().toLowerCase();

// PI-104/105/107 — the GDPR data-subject-rights actions for one roster entry:
// anonymise (Art. 17 erasure that keeps standings intact), hide/show on the
// public pages (Art. 21 objection), and download the player's own data
// (Art. 15 / 20). Tucked behind a "Privacy ▾" toggle so the common row stays
// uncluttered. See docs/gdpr.md.
function PrivacyControls({ player }: { player: Player }) {
  const [open, setOpen] = useState(false);
  const [confirmAnon, setConfirmAnon] = useState(false);
  const anonymise = useAnonymisePlayer();
  const setHidden = useSetPlayerPublicHidden();
  const download = useDownloadPlayerData();

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
        Privacy {open ? "▴" : "▾"}
      </Button>
      {open && (
        <div className="mt-2 flex w-full flex-wrap items-center gap-2 rounded-md border border-border bg-surface-sunken px-3 py-2">
          <Button variant="ghost" onClick={() => download.mutate({ id: player.id, name: player.displayName })}>
            {download.isPending ? "Preparing…" : "Download data"}
          </Button>
          <Button
            variant="ghost"
            disabled={setHidden.isPending}
            onClick={() => setHidden.mutate({ id: player.id, hidden: !player.publicHidden })}
          >
            {player.publicHidden ? "Show on public pages" : "Hide from public pages"}
          </Button>
          {!player.anonymised && (
            <Button variant="danger" onClick={() => setConfirmAnon(true)}>
              Anonymise
            </Button>
          )}
          {download.isError && <FormError>Couldn't prepare the download. Try again.</FormError>}
        </div>
      )}

      {confirmAnon && (
        <Modal title={`Anonymise ${player.displayName}?`} onClose={() => setConfirmAnon(false)}>
          <div className="flex flex-col gap-3 text-[13px] text-ink-secondary">
            <p>
              This scrubs the name to a non-identifying label and removes their login, any pending invite, and
              token-ledger notes. Their match results, standings, Gesamtwertung and Hall of Fame numbers stay exactly
              the same.
            </p>
            <p className="text-critical">This can't be undone — there's nothing to restore the name from.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmAnon(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={anonymise.isPending}
                onClick={() =>
                  anonymise.mutate(player.id, {
                    onSuccess: () => {
                      setConfirmAnon(false);
                      setOpen(false);
                    },
                  })
                }
              >
                {anonymise.isPending ? "Anonymising…" : "Anonymise player"}
              </Button>
            </div>
            {anonymise.isError && <FormError>Couldn't anonymise that player. Try again.</FormError>}
          </div>
        </Modal>
      )}
    </>
  );
}

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
    return <SharePopup url={link} title="Player invite link" onClose={() => setLink(null)} />;
  }

  if (player.pendingInvite || showForm) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim()) return;
          invite.mutate({ id: player.id, email: email.trim() }, { onSuccess: (res) => setLink(res.acceptUrl) });
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
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={`/hall-of-fame/players/${player.id}`}
          className="font-display text-[15.5px] font-bold hover:text-accent-strong"
        >
          {player.displayName}
        </Link>
        {player.anonymised && <StatusPill tone="critical">Anonymised</StatusPill>}
        {player.publicHidden && <StatusPill tone="warning">Hidden from public</StatusPill>}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {!player.anonymised && <AccountControls player={player} orgSlug={orgSlug} />}
        <Button variant="ghost" onClick={() => setEditing(true)}>
          Rename
        </Button>
        <PrivacyControls player={player} />
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
        Players persist across every tournament your group runs — add them once here. Invite a player to a login and
        they can check themselves in and report their own results at{" "}
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
