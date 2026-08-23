import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTournament } from "../features/tournaments/useTournament";
import { useCreatePod, podFormatLabel } from "../features/pods/usePods";
import { useMe } from "../features/auth/useAuth";
import { Button, Card, Eyebrow, Field, ScreenDek, ScreenTitle, TextField } from "../components/ui";
import type { PodFormat } from "../lib/types";

const podFormats: PodFormat[] = ["DRAFT", "SEALED", "CHAOS_DRAFT", "CONSTRUCTED", "CUSTOM"];

function NewPodForm({ tournamentId, nextSequenceOrder }: { tournamentId: string; nextSequenceOrder: number }) {
  const createPod = useCreatePod(tournamentId);
  const [name, setName] = useState("");
  const [format, setFormat] = useState<PodFormat>("DRAFT");
  const [date, setDate] = useState("");
  const [isTeamEvent, setIsTeamEvent] = useState(false);
  const [teamSize, setTeamSize] = useState(2);
  const [roundCount, setRoundCount] = useState(3);
  const [matchFormat, setMatchFormat] = useState<"BO1" | "BO3">("BO3");
  const [pointsWin, setPointsWin] = useState(3);
  const [pointsDraw, setPointsDraw] = useState(1);
  const [pointsLoss, setPointsLoss] = useState(0);
  const [roundLengthMinutes, setRoundLengthMinutes] = useState(50);

  return (
    <Card className="p-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          createPod.mutate({
            name,
            format,
            sequenceOrder: nextSequenceOrder,
            date: date || undefined,
            isTeamEvent,
            teamSize: isTeamEvent ? teamSize : undefined,
            roundCount,
            matchFormat,
            pointsWin,
            pointsDraw,
            pointsLoss,
            roundLengthMinutes,
          });
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <TextField required value={name} onChange={(e) => setName(e.target.value)} placeholder="Battlebond" />
          </Field>
          <Field label="Format">
            <select
              className="rounded-md border border-border-strong bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              value={format}
              onChange={(e) => setFormat(e.target.value as PodFormat)}
            >
              {podFormats.map((f) => (
                <option key={f} value={f}>
                  {podFormatLabel[f]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Date" hint="Optional">
          <TextField type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
          <input type="checkbox" checked={isTeamEvent} onChange={(e) => setIsTeamEvent(e.target.checked)} />
          Team event (2HG-style — entrants are teams, not individual players)
        </label>
        {isTeamEvent && (
          <Field label="Players per team">
            <TextField
              type="number"
              min={2}
              max={8}
              value={teamSize}
              onChange={(e) => setTeamSize(Number(e.target.value))}
            />
          </Field>
        )}

        <details>
          <summary className="cursor-pointer text-[12.5px] tracking-wide text-ink-secondary uppercase select-none">
            Advanced settings
          </summary>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Rounds">
              <TextField
                type="number"
                min={1}
                max={20}
                value={roundCount}
                onChange={(e) => setRoundCount(Number(e.target.value))}
              />
            </Field>
            <Field label="Match format">
              <select
                className="rounded-md border border-border-strong bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                value={matchFormat}
                onChange={(e) => setMatchFormat(e.target.value as "BO1" | "BO3")}
              >
                <option value="BO1">Best of 1</option>
                <option value="BO3">Best of 3</option>
              </select>
            </Field>
            <Field label="Points — win">
              <TextField type="number" min={0} value={pointsWin} onChange={(e) => setPointsWin(Number(e.target.value))} />
            </Field>
            <Field label="Points — draw">
              <TextField type="number" min={0} value={pointsDraw} onChange={(e) => setPointsDraw(Number(e.target.value))} />
            </Field>
            <Field label="Points — loss">
              <TextField type="number" min={0} value={pointsLoss} onChange={(e) => setPointsLoss(Number(e.target.value))} />
            </Field>
            <Field label="Round length (minutes)">
              <TextField
                type="number"
                min={1}
                value={roundLengthMinutes}
                onChange={(e) => setRoundLengthMinutes(Number(e.target.value))}
              />
            </Field>
          </div>
        </details>

        <Button type="submit" variant="primary" disabled={createPod.isPending}>
          {createPod.isPending ? "Creating…" : "Create pod"}
        </Button>
      </form>
    </Card>
  );
}

export function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useTournament(id);
  const { data: me } = useMe();
  const [showPodForm, setShowPodForm] = useState(false);

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!data) return <p className="text-ink-muted">Tournament not found.</p>;

  const { tournament } = data;

  return (
    <div>
      <Eyebrow>Weekend overview</Eyebrow>
      <ScreenTitle>{tournament.name}</ScreenTitle>
      <ScreenDek>
        {tournament.pods.length === 0
          ? "No pods yet — add one to start pairing."
          : `${tournament.pods.length} pod${tournament.pods.length === 1 ? "" : "s"} · ${tournament.players.length} player${tournament.players.length === 1 ? "" : "s"} attending`}
      </ScreenDek>

      {tournament.players.length > 0 && (
        <div className="mb-6 flex gap-5">
          <Link
            to={`/tournaments/${tournament.id}/gesamtwertung`}
            className="inline-block text-[12.5px] tracking-wide text-accent uppercase hover:text-accent-strong"
          >
            View Gesamtwertung →
          </Link>
          <Link
            to={`/tournaments/${tournament.id}/value`}
            className="inline-block text-[12.5px] tracking-wide text-accent uppercase hover:text-accent-strong"
          >
            Best pulls of the weekend →
          </Link>
          {me && (
            <a
              href={`/o/${me.organization.slug}/tournaments/${tournament.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-[12.5px] tracking-wide text-ink-secondary uppercase hover:text-ink"
            >
              Public link ↗
            </a>
          )}
        </div>
      )}

      {tournament.pods.length > 0 && (
        <div className="mb-6 flex flex-col gap-2">
          {tournament.pods.map((pod) => (
            <Link key={pod.id} to={`/pods/${pod.id}`}>
              <Card className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-surface-raised">
                <div>
                  <div className="font-display text-[16px] font-bold">{pod.name}</div>
                  <div className="text-[12.5px] text-ink-muted">
                    {podFormatLabel[pod.format]}
                    {pod.isTeamEvent && ` · teams of ${pod.teamSize}`} · {pod.roundCount} rounds
                  </div>
                </div>
                <span className="text-[11.5px] tracking-wide text-ink-secondary uppercase">{pod.status}</span>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {!showPodForm && <Button onClick={() => setShowPodForm(true)}>+ New pod</Button>}
      {showPodForm && (
        <div className="flex flex-col gap-3">
          <NewPodForm tournamentId={tournament.id} nextSequenceOrder={tournament.pods.length} />
          <Button variant="ghost" onClick={() => setShowPodForm(false)} className="self-start">
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
