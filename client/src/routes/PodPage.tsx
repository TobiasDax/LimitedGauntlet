import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { usePod, podFormatLabel, podFormatDisplay, useUpdatePod, useDeletePod, type PodDetail } from "../features/pods/usePods";
import {
  useAddTeamEntrant,
  useRemoveEntrant,
  useDropEntrant,
  useUndropEntrant,
  entrantErrorMessage,
} from "../features/pods/useEntrants";
import { usePlayers } from "../features/players/usePlayers";
import { EntrantPickerModal } from "../components/EntrantPickerModal";
import { useRounds } from "../features/pods/useRounds";
import { useTournament } from "../features/tournaments/useTournament";
import { useMe } from "../features/auth/useAuth";
import { Button, Card, Eyebrow, Field, FormError, ScreenDek, ScreenTitle, TextField } from "../components/ui";
import { PodTabs } from "../components/PodTabs";
import { PrepTimer } from "../components/PrepTimer";
import { usePodRealtime } from "../features/pods/usePodRealtime";
import { SetPicker } from "../components/SetPicker";
import { ConstructedFormatPicker } from "../components/ConstructedFormatPicker";
import { SharePopup } from "../components/SharePopup";
import { entrantDisplayName } from "../lib/entrant";
import type { ConstructedFormat, Entrant, MatchFormat, PodFormat } from "../lib/types";

const podFormats: PodFormat[] = ["DRAFT", "SEALED", "CHAOS_DRAFT", "CONSTRUCTED", "CUSTOM"];

function EditPodForm({ pod, onDone }: { pod: PodDetail; onDone: () => void }) {
  const updatePod = useUpdatePod(pod.id, pod.tournamentId);
  const [name, setName] = useState(pod.name);
  const [format, setFormat] = useState<PodFormat>(pod.format);
  const [date, setDate] = useState(pod.date ? pod.date.slice(0, 10) : "");
  const [roundCount, setRoundCount] = useState(pod.roundCount);
  const [matchFormat, setMatchFormat] = useState<MatchFormat>(pod.matchFormat);
  const [pointsWin, setPointsWin] = useState(pod.pointsWin);
  const [pointsDraw, setPointsDraw] = useState(pod.pointsDraw);
  const [pointsLoss, setPointsLoss] = useState(pod.pointsLoss);
  const [roundLengthMinutes, setRoundLengthMinutes] = useState(pod.roundLengthMinutes);
  const [excludeFromStats, setExcludeFromStats] = useState(pod.excludeFromStats);
  const [rarePicksEnabled, setRarePicksEnabled] = useState(pod.rarePicksEnabled);
  const [webhookEnabled, setWebhookEnabled] = useState(pod.webhookEnabled);
  const [isMainEvent, setIsMainEvent] = useState(pod.isMainEvent);
  const [setCode, setSetCode] = useState(pod.setCode ?? "");
  const [constructedFormat, setConstructedFormat] = useState<ConstructedFormat | "">(pod.constructedFormat ?? "");
  const [constructedFormatCustom, setConstructedFormatCustom] = useState(pod.constructedFormatCustom ?? "");

  return (
    <Card className="mb-6 p-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          updatePod.mutate(
            {
              name,
              format,
              date: date || undefined,
              roundCount,
              matchFormat,
              pointsWin,
              pointsDraw,
              pointsLoss,
              roundLengthMinutes,
              excludeFromStats,
              rarePicksEnabled,
              webhookEnabled,
              isMainEvent,
              setCode: setCode || null,
              constructedFormat: format === "CONSTRUCTED" && constructedFormat ? constructedFormat : null,
              constructedFormatCustom:
                format === "CONSTRUCTED" && constructedFormat === "CUSTOM" ? constructedFormatCustom || null : null,
            },
            { onSuccess: onDone },
          );
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <TextField required value={name} onChange={(e) => setName(e.target.value)} />
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
        {format === "CONSTRUCTED" && (
          <ConstructedFormatPicker
            value={constructedFormat}
            customValue={constructedFormatCustom}
            onChange={setConstructedFormat}
            onCustomChange={setConstructedFormatCustom}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              onChange={(e) => setMatchFormat(e.target.value as MatchFormat)}
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

        <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
          <input
            type="checkbox"
            checked={excludeFromStats}
            onChange={(e) => setExcludeFromStats(e.target.checked)}
          />
          Exclude from org-wide stats (Hall of Fame, Treasure Chest) — for one-off, joke, or test pods
        </label>

        <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
          <input
            type="checkbox"
            checked={rarePicksEnabled}
            onChange={(e) => setRarePicksEnabled(e.target.checked)}
          />
          Track rare picks (card values) for this pod — off hides the Value tab and blocks adding pulls; existing
          pulls are kept and reappear if you turn it back on
        </label>

        <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
          <input
            type="checkbox"
            checked={webhookEnabled}
            onChange={(e) => setWebhookEnabled(e.target.checked)}
          />
          Send events to the org's configured webhook for this pod (Settings → Webhook)
        </label>

        <label className="flex items-center gap-2 text-[13px] text-ink-secondary">
          <input type="checkbox" checked={isMainEvent} onChange={(e) => setIsMainEvent(e.target.checked)} />
          Mark as this tournament's main event — the winner earns a crown on the Hall of Fame (only one pod per
          tournament can be the main event; checking this unchecks any other)
        </label>

        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={updatePod.isPending}>
            {updatePod.isPending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
        {updatePod.isError && <FormError>Something went wrong.</FormError>}
      </form>
    </Card>
  );
}

function DeletePodButton({ pod }: { pod: PodDetail }) {
  const navigate = useNavigate();
  const deletePod = useDeletePod(pod.tournamentId);

  return (
    <button
      disabled={deletePod.isPending}
      onClick={() => {
        if (!confirm(`Delete "${pod.name}"? This removes its rounds, matches, and entrants too.`)) return;
        deletePod.mutate(pod.id, { onSuccess: () => navigate(`/tournaments/${pod.tournamentId}`) });
      }}
      className="text-[12.5px] tracking-wide text-critical uppercase hover:text-critical/80 disabled:opacity-50"
    >
      Delete pod
    </button>
  );
}

function alreadyEnteredPlayerIds(entrants: Entrant[]): Set<string> {
  const ids = new Set<string>();
  for (const e of entrants) {
    if (e.player) ids.add(e.player.id);
    if (e.team) for (const m of e.team.members) ids.add(m.playerId);
  }
  return ids;
}

// Drop/undrop toggle + "Dropped" badge shared by the individual and team
// entrant lists. Disabled between an active/pending round (PI-63) — the
// title attribute explains why rather than hiding the control outright.
function EntrantDropControl({
  podId,
  entrant,
  canModifyRoster,
}: {
  podId: string;
  entrant: Entrant;
  canModifyRoster: boolean;
}) {
  const dropEntrant = useDropEntrant(podId);
  const undropEntrant = useUndropEntrant(podId);
  const dropped = entrant.droppedAfterRound !== null;
  const pending = dropped ? undropEntrant.isPending : dropEntrant.isPending;

  return (
    <div className="flex items-center gap-3">
      {dropped && <span className="text-[12px] tracking-wide text-ink-muted uppercase">Dropped</span>}
      <Button
        variant="ghost"
        disabled={!canModifyRoster || pending}
        title={canModifyRoster ? undefined : "Finish the current round before changing who's dropped."}
        onClick={() => (dropped ? undropEntrant.mutate(entrant.id) : dropEntrant.mutate(entrant.id))}
      >
        {dropped ? "Un-drop" : "Drop"}
      </Button>
      {(dropEntrant.isError || undropEntrant.isError) && (
        <FormError>{entrantErrorMessage(dropEntrant.error ?? undropEntrant.error)}</FormError>
      )}
    </div>
  );
}

function IndividualEntrants({
  podId,
  podName,
  entrants,
  canModifyRoster,
}: {
  podId: string;
  podName: string;
  entrants: Entrant[];
  canModifyRoster: boolean;
}) {
  const removeEntrant = useRemoveEntrant(podId);
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div>
      <Card className="mb-4 divide-y divide-border">
        {entrants.length === 0 && <p className="px-5 py-4 text-[13.5px] text-ink-muted">No entrants yet.</p>}
        {entrants.map((e) => (
          <div key={e.id} className="flex items-center justify-between px-5 py-3">
            <span className="font-display text-[15px] font-bold">{entrantDisplayName(e)}</span>
            <div className="flex items-center gap-2">
              <EntrantDropControl podId={podId} entrant={e} canModifyRoster={canModifyRoster} />
              <Button variant="ghost" onClick={() => removeEntrant.mutate(e.id)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </Card>

      <Button variant="primary" onClick={() => setShowPicker(true)}>
        + Add players
      </Button>
      {removeEntrant.isError && <FormError>{entrantErrorMessage(removeEntrant.error)}</FormError>}

      {showPicker && (
        <EntrantPickerModal
          podId={podId}
          podName={podName}
          enteredPlayerIds={alreadyEnteredPlayerIds(entrants)}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

function TeamEntrants({
  podId,
  entrants,
  teamSize,
  canModifyRoster,
}: {
  podId: string;
  entrants: Entrant[];
  teamSize: number | null;
  canModifyRoster: boolean;
}) {
  const { data: playersData } = usePlayers();
  const addTeam = useAddTeamEntrant(podId);
  const removeEntrant = useRemoveEntrant(podId);
  const [teamName, setTeamName] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);

  const taken = alreadyEnteredPlayerIds(entrants);
  const available = (playersData?.players ?? []).filter((p) => !taken.has(p.id));
  const wrongSize = teamSize != null && memberIds.length !== teamSize;

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
            <div className="flex items-center gap-2">
              <EntrantDropControl podId={podId} entrant={e} canModifyRoster={canModifyRoster} />
              <Button variant="ghost" onClick={() => removeEntrant.mutate(e.id)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </Card>

      {available.length > 0 ? (
        <Card className="p-5">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!teamName.trim() || memberIds.length === 0 || wrongSize) return;
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
            {teamSize != null && (
              <p className={`text-[12px] ${wrongSize ? "text-critical" : "text-ink-muted"}`}>
                {memberIds.length} / {teamSize} selected
              </p>
            )}
            <Button
              type="submit"
              variant="primary"
              disabled={!teamName.trim() || memberIds.length === 0 || wrongSize || addTeam.isPending}
            >
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
  const { data: roundsData } = useRounds(id);
  const { data: me } = useMe();
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  usePodRealtime(id, data?.pod.tournamentId);

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!data) return <p className="text-ink-muted">Pod not found.</p>;

  const { pod } = data;
  const rounds = roundsData?.rounds ?? [];
  const lastRound = rounds[rounds.length - 1];
  // The pre-round timer only makes sense before the pod is under way — hide it
  // once any round has started (PI-54 already auto-clears a running one then);
  // it stays hidden for a finished pod.
  const podUnderway = rounds.some((r) => r.status === "ACTIVE" || r.status === "COMPLETED");
  // Roster changes (drop/undrop) are only safe between rounds — never while
  // one is ACTIVE/PENDING — same gate PairingsPage uses before pairing the
  // next round.
  const canModifyRoster = rounds.length === 0 || lastRound?.status === "COMPLETED";

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
        {podFormatDisplay(pod)} · {pod.roundCount} rounds
      </Eyebrow>
      <ScreenTitle>
        {pod.isMainEvent && <span title="This tournament's main event">👑 </span>}
        {pod.name}
      </ScreenTitle>
      <ScreenDek>
        {pod.isTeamEvent
          ? `Team event — teams of ${pod.teamSize}. Assign the roster into teams before pairing round 1.`
          : "Individual entrants. Add everyone playing before pairing round 1."}
      </ScreenDek>

      <div className="mb-6 flex flex-wrap items-center gap-5">
        {me && (
          <button
            onClick={() => setSharing(true)}
            className="text-[12.5px] tracking-wide text-ink-secondary uppercase hover:text-ink"
          >
            Share public link ↗
          </button>
        )}
        {me && sharing && (
          <SharePopup
            title="Share this pod"
            path={`/o/${me.organization.slug}/tournaments/${pod.tournamentId}/pods/${pod.id}`}
            onClose={() => setSharing(false)}
          />
        )}
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-[12.5px] tracking-wide text-link uppercase hover:text-link-strong"
          >
            Edit pod
          </button>
        )}
        <DeletePodButton pod={pod} />
      </div>

      {editing && <EditPodForm pod={pod} onDone={() => setEditing(false)} />}

      {!podUnderway && <PrepTimer pod={pod} />}

      <PodTabs podId={pod.id} />

      {pod.isTeamEvent ? (
        <TeamEntrants podId={pod.id} entrants={pod.entrants} teamSize={pod.teamSize} canModifyRoster={canModifyRoster} />
      ) : (
        <IndividualEntrants podId={pod.id} podName={pod.name} entrants={pod.entrants} canModifyRoster={canModifyRoster} />
      )}
    </div>
  );
}
