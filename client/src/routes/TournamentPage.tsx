import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTournament, tournamentStatusLabel, type TournamentDetail } from "../features/tournaments/useTournament";
import { useUpdateTournament, useDeleteTournament } from "../features/tournaments/useTournaments";
import { useCreatePod, podFormatLabel } from "../features/pods/usePods";
import { useMe } from "../features/auth/useAuth";
import { Button, Card, Eyebrow, Field, FormError, ScreenDek, ScreenTitle, TextField, Textarea } from "../components/ui";
import { RichText } from "../components/RichText";
import { SetPicker } from "../components/SetPicker";
import type { PodFormat, TournamentStatus } from "../lib/types";

const tournamentStatuses: TournamentStatus[] = ["PLANNING", "ACTIVE", "COMPLETED"];

function EditTournamentForm({ tournament, onDone }: { tournament: TournamentDetail; onDone: () => void }) {
  const update = useUpdateTournament(tournament.id);
  const [name, setName] = useState(tournament.name);
  const [startDate, setStartDate] = useState(tournament.startDate.slice(0, 10));
  const [endDate, setEndDate] = useState(tournament.endDate.slice(0, 10));
  const [location, setLocation] = useState(tournament.location ?? "");
  const [status, setStatus] = useState<TournamentStatus>(tournament.status);

  return (
    <Card className="mb-6 p-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(
            { name, startDate, endDate, location: location.trim() || null, status },
            { onSuccess: onDone },
          );
        }}
      >
        <Field label="Name">
          <TextField required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Start date">
            <TextField type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="End date">
            <TextField type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Location" hint="Optional">
            <TextField value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          <Field label="Status">
            <select
              className="rounded-md border border-border-strong bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              value={status}
              onChange={(e) => setStatus(e.target.value as TournamentStatus)}
            >
              {tournamentStatuses.map((s) => (
                <option key={s} value={s}>
                  {tournamentStatusLabel[s]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
        {update.isError && <FormError>Something went wrong.</FormError>}
      </form>
    </Card>
  );
}

function DeleteTournamentButton({ tournament }: { tournament: TournamentDetail }) {
  const navigate = useNavigate();
  const deleteTournament = useDeleteTournament();

  return (
    <button
      disabled={deleteTournament.isPending}
      onClick={() => {
        if (!confirm(`Delete "${tournament.name}"? This removes every pod, round, and card pull in it too.`)) return;
        deleteTournament.mutate(tournament.id, { onSuccess: () => navigate("/") });
      }}
      className="text-[12.5px] tracking-wide text-critical uppercase hover:text-critical/80 disabled:opacity-50"
    >
      Delete tournament
    </button>
  );
}

function DescriptionSection({ tournament }: { tournament: TournamentDetail }) {
  const update = useUpdateTournament(tournament.id);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(tournament.description ?? "");

  if (!editing) {
    return (
      <div className="mb-6">
        {tournament.description ? (
          <RichText text={tournament.description} />
        ) : (
          <p className="text-[13px] text-ink-muted">No description yet.</p>
        )}
        <button
          onClick={() => {
            setText(tournament.description ?? "");
            setEditing(true);
          }}
          className="mt-1.5 text-[12px] tracking-wide text-link uppercase hover:text-link-strong"
        >
          {tournament.description ? "Edit description" : "+ Add description"}
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-col gap-2">
      <Textarea
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Links to the Outline pages, venue notes, format explainer… URLs and [label](https://…) become clickable."
      />
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={update.isPending}
          onClick={() =>
            update.mutate({ description: text.trim() || null }, { onSuccess: () => setEditing(false) })
          }
        >
          {update.isPending ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

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
  const [isMainEvent, setIsMainEvent] = useState(false);
  const [setCode, setSetCode] = useState("");

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
            isMainEvent,
            setCode: setCode || undefined,
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

        {(format === "DRAFT" || format === "SEALED") && <SetPicker value={setCode} onChange={setSetCode} />}

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

        <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
          <input type="checkbox" checked={isMainEvent} onChange={(e) => setIsMainEvent(e.target.checked)} />
          Mark as this tournament's main event — the pod winner earns a crown on the Hall of Fame (only one pod per
          tournament can be the main event; checking this unchecks any other)
        </label>

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
  const [editingTournament, setEditingTournament] = useState(false);

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

      <div className="mb-6 flex flex-wrap items-center gap-5">
        {!editingTournament && (
          <button
            onClick={() => setEditingTournament(true)}
            className="text-[12.5px] tracking-wide text-link uppercase hover:text-link-strong"
          >
            Edit tournament
          </button>
        )}
        <DeleteTournamentButton tournament={tournament} />
      </div>
      {editingTournament && (
        <EditTournamentForm tournament={tournament} onDone={() => setEditingTournament(false)} />
      )}

      <DescriptionSection tournament={tournament} />

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
                  <div className="font-display text-[16px] font-bold">
                    {pod.isMainEvent && <span title="This tournament's main event">👑 </span>}
                    {pod.name}
                  </div>
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
