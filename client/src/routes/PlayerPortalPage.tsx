import { useState } from "react";
import { ApiError } from "../lib/api";
import {
  useCheckIn,
  useDownloadOwnData,
  usePlayerMe,
  usePlayerPortal,
  useRenameSelf,
  useRequestRemoval,
  useSubmitPlayerResult,
} from "../features/player/usePlayer";
import { usePlayerPortalRealtime } from "../features/player/usePlayerPortalRealtime";
import { usePlayerPortalTokens } from "../features/tokens/useTokens";
import { Stepper } from "../components/Stepper";
import { PlayerTokenLedger } from "../components/PlayerTokenLedger";
import { Button, Card, Eyebrow, FormError, ScreenTitle, TextField, Textarea } from "../components/ui";
import type { PlayerPortalMatch } from "../lib/types";

function MyMatchCard({ match }: { match: PlayerPortalMatch }) {
  const submit = useSubmitPlayerResult();
  const maxGames = match.matchFormat === "BO1" ? 1 : 2;
  // The portal always frames the score as "you – opponent" regardless of which
  // physical seat the player is on; convert to A/B on submit.
  const [mine, setMine] = useState(match.mySide === "A" ? match.gamesWonA : match.gamesWonB);
  const [theirs, setTheirs] = useState(match.mySide === "A" ? match.gamesWonB : match.gamesWonA);
  const reported = match.result !== "PENDING";

  return (
    <Card className="p-4">
      <div className="mb-1 text-[11px] tracking-wide text-ink-muted uppercase">
        {match.podName} · Round {match.roundNumber}
      </div>
      <div className="mb-3 font-display text-[15px] font-bold">
        You <span className="mx-2 text-[11px] font-normal text-ink-muted">vs</span> {match.opponentName}
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const gamesWonA = match.mySide === "A" ? mine : theirs;
          const gamesWonB = match.mySide === "A" ? theirs : mine;
          submit.mutate({ matchId: match.matchId, gamesWonA, gamesWonB });
        }}
      >
        <div className="flex items-center gap-1.5">
          <Stepper value={mine} onChange={setMine} max={maxGames} ariaLabel="Your games won" className="flex-1" />
          <span className="text-ink-muted">–</span>
          <Stepper
            value={theirs}
            onChange={setTheirs}
            max={maxGames}
            ariaLabel="Opponent games won"
            className="flex-1"
          />
        </div>
        <Button type="submit" variant="primary" disabled={submit.isPending} className="w-full">
          {reported ? "Update result" : "Submit result"}
        </Button>
        {reported && !submit.isPending && (
          <p className="text-[11px] text-ink-muted">
            Reported {match.gamesWonA}–{match.gamesWonB}. You or your opponent can still fix it until the organizer
            closes the round.
          </p>
        )}
        {submit.isError && (
          <FormError>
            {submit.error instanceof ApiError && submit.error.message === "round_not_active"
              ? "That round isn't running right now."
              : submit.error instanceof ApiError && submit.error.message === "not_your_match"
                ? "You're not in that match."
                : "Couldn't save that. Try again."}
          </FormError>
        )}
      </form>
    </Card>
  );
}

// PI-105/106 — the player's own data-subject-rights controls: correct your
// name (Art. 16), download your data (Art. 15 / 20), or ask the organizers to
// remove you (Art. 17 / 21). See docs/gdpr.md.
function AccountSection({ currentName }: { currentName: string }) {
  const [name, setName] = useState(currentName);
  const [editing, setEditing] = useState(false);
  const [showRemoval, setShowRemoval] = useState(false);
  const [message, setMessage] = useState("");
  const rename = useRenameSelf();
  const download = useDownloadOwnData();
  const removal = useRequestRemoval();

  return (
    <section>
      <h2 className="mb-3 font-display text-[16px] font-bold">Your account</h2>
      <Card className="flex flex-col gap-4 p-4">
        <div>
          <div className="mb-1 text-[11px] tracking-wide text-ink-muted uppercase">Display name</div>
          {editing ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const next = name.trim();
                if (!next) return;
                rename.mutate(next, { onSuccess: () => setEditing(false) });
              }}
            >
              <TextField value={name} onChange={(e) => setName(e.target.value)} autoFocus className="w-56" />
              <Button type="submit" variant="primary" disabled={rename.isPending}>
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setName(currentName);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              {rename.isError && (
                <FormError>
                  {rename.error instanceof ApiError && rename.error.message === "name_taken"
                    ? "Someone in this group already uses that name."
                    : rename.error instanceof ApiError && rename.error.message === "anonymised"
                      ? "This entry has been anonymised and can't be renamed."
                      : "Couldn't save that. Try again."}
                </FormError>
              )}
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-display text-[15px] font-bold">{currentName}</span>
              <Button variant="ghost" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={() => download.mutate()} disabled={download.isPending}>
            {download.isPending ? "Preparing…" : "Download my data"}
          </Button>
          <Button variant="ghost" onClick={() => setShowRemoval((v) => !v)}>
            Request removal
          </Button>
          {download.isError && <FormError>Couldn't prepare the download. Try again.</FormError>}
        </div>

        {showRemoval && (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-3">
            {removal.isSuccess ? (
              <p className="text-[13px] text-good">
                Sent. The organizers have been notified and will remove or anonymise you.
              </p>
            ) : (
              <>
                <p className="text-[12.5px] text-ink-secondary">
                  This asks the organizers to anonymise you or hide you from the public pages — they action it by hand.
                  Add anything they should know:
                </p>
                <Textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Optional message"
                />
                <div className="flex justify-end">
                  <Button variant="danger" disabled={removal.isPending} onClick={() => removal.mutate(message)}>
                    {removal.isPending ? "Sending…" : "Send request"}
                  </Button>
                </div>
                {removal.isError && <FormError>Couldn't send that. Try again in a bit.</FormError>}
              </>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}

export function PlayerPortalPage() {
  const { data: me } = usePlayerMe();
  const { data, isLoading } = usePlayerPortal(!!me);
  const checkIn = useCheckIn();
  usePlayerPortalRealtime(data?.matches.map((m) => m.podId) ?? []);
  const { data: tokens } = usePlayerPortalTokens();

  if (isLoading || !data) return <div className="py-16 text-center text-ink-muted">Loading…</div>;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Eyebrow>Signed in as {me?.player.displayName}</Eyebrow>
        <ScreenTitle>Your portal</ScreenTitle>
      </div>

      {tokens && (
        <section>
          <h2 className="mb-3 font-display text-[16px] font-bold">Your tokens</h2>
          <PlayerTokenLedger ledger={tokens} />
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-[16px] font-bold">Your matches</h2>
        {data.matches.length === 0 ? (
          <p className="text-[13px] text-ink-muted">
            No match to report right now — check back when your round starts.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {data.matches.map((m) => (
              // Remount when the stored score changes out from under us (an
              // opponent's entry arrives over realtime) so the steppers re-seed.
              <MyMatchCard key={`${m.matchId}:${m.gamesWonA}-${m.gamesWonB}`} match={m} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-[16px] font-bold">Tournaments</h2>
        {data.tournaments.length === 0 ? (
          <p className="text-[13px] text-ink-muted">This group has no tournaments yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.tournaments.map((t) => (
              <Card key={t.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-display text-[14.5px] font-bold">{t.name}</div>
                  <div className="text-[11.5px] text-ink-muted">
                    {t.checkedIn ? "You're checked in" : "Not checked in"}
                  </div>
                </div>
                <Button
                  variant={t.checkedIn ? "ghost" : "primary"}
                  disabled={checkIn.isPending}
                  onClick={() => checkIn.mutate({ tournamentId: t.id, checkedIn: t.checkedIn })}
                >
                  {t.checkedIn ? "Check out" : "Check in"}
                </Button>
              </Card>
            ))}
          </div>
        )}
        {checkIn.isError && (
          <FormError>
            {checkIn.error instanceof ApiError && checkIn.error.message === "already_entered"
              ? "You're already paired into a pod — ask an organizer to remove you."
              : "Couldn't update that. Try again."}
          </FormError>
        )}
      </section>

      {me && <AccountSection currentName={me.player.displayName} />}
    </div>
  );
}
