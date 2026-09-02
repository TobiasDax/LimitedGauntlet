import { useState } from "react";
import { ApiError } from "../lib/api";
import {
  useCheckIn,
  usePlayerMe,
  usePlayerPortal,
  useSubmitPlayerResult,
} from "../features/player/usePlayer";
import { usePlayerPortalRealtime } from "../features/player/usePlayerPortalRealtime";
import { Stepper } from "../components/Stepper";
import { Button, Card, Eyebrow, FormError, ScreenTitle } from "../components/ui";
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
          <Stepper value={theirs} onChange={setTheirs} max={maxGames} ariaLabel="Opponent games won" className="flex-1" />
        </div>
        <Button type="submit" variant="primary" disabled={submit.isPending} className="w-full">
          {reported ? "Update result" : "Submit result"}
        </Button>
        {reported && !submit.isPending && (
          <p className="text-[11px] text-ink-muted">
            Reported {match.gamesWonA}–{match.gamesWonB}. You or your opponent can still fix it until the
            organizer closes the round.
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

export function PlayerPortalPage() {
  const { data: me } = usePlayerMe();
  const { data, isLoading } = usePlayerPortal(!!me);
  const checkIn = useCheckIn();
  usePlayerPortalRealtime(data?.matches.map((m) => m.podId) ?? []);

  if (isLoading || !data) return <div className="py-16 text-center text-ink-muted">Loading…</div>;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Eyebrow>Signed in as {me?.player.displayName}</Eyebrow>
        <ScreenTitle>Your portal</ScreenTitle>
      </div>

      <section>
        <h2 className="mb-3 font-display text-[16px] font-bold">Your matches</h2>
        {data.matches.length === 0 ? (
          <p className="text-[13px] text-ink-muted">No match to report right now — check back when your round starts.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {data.matches.map((m) => (
              <MyMatchCard key={m.matchId} match={m} />
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
    </div>
  );
}
