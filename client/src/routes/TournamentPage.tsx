import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Download, ExternalLink } from "lucide-react";
import {
  useTournament,
  useApplyPass,
  useExportTournamentXlsx,
  tournamentStatusLabel,
  type TournamentDetail,
} from "../features/tournaments/useTournament";
import {
  useUpdateTournament,
  useAutosaveTournamentText,
  useDeleteTournament,
  useReorderPods,
} from "../features/tournaments/useTournaments";
import { useCreatePod, podFormatLabel } from "../features/pods/usePods";
import { useMe } from "../features/auth/useAuth";
import { useAppConfig } from "../features/config/useAppConfig";
import { useTournamentRealtime } from "../features/tournaments/useTournamentRealtime";
import { Button, Card, Eyebrow, Field, FormError, ScreenDek, ScreenTitle, TextField, Textarea } from "../components/ui";
import { RichText } from "../components/RichText";
import { SetPicker } from "../components/SetPicker";
import { ConstructedFormatPicker } from "../components/ConstructedFormatPicker";
import { StandingBonusEditor } from "../components/StandingBonusEditor";
import { SharePopup } from "../components/SharePopup";
import { PodList } from "../components/PodList";
import type { ConstructedFormat, PodFormat, StandingBonusRow, TournamentStatus } from "../lib/types";

const tournamentStatuses: TournamentStatus[] = ["PLANNING", "ACTIVE", "COMPLETED"];

function EditTournamentForm({ tournament, onDone }: { tournament: TournamentDetail; onDone: () => void }) {
  const update = useUpdateTournament(tournament.id);
  const { data: me } = useMe();
  const { data: appConfig } = useAppConfig();
  const [name, setName] = useState(tournament.name);
  const [startDate, setStartDate] = useState(tournament.startDate.slice(0, 10));
  const [endDate, setEndDate] = useState(tournament.endDate.slice(0, 10));
  const [location, setLocation] = useState(tournament.location ?? "");
  const [status, setStatus] = useState<TournamentStatus>(tournament.status);
  const [tokenParticipation, setTokenParticipation] = useState(tournament.tokenParticipation);
  const [tokenBonuses, setTokenBonuses] = useState<StandingBonusRow[]>(tournament.tokenStandingBonuses ?? []);

  // HI-5/HI-9 — on the hosted unsubscribed tiers a tournament's dates are
  // fixed once set; the server rejects an edit. Rather than show date fields
  // that 402 on save, show the dates read-only with an explanation and a
  // support contact (the sanctioned way to change them, via the operator CLI).
  // `canEditTournamentDates === false` only when entitlements are enforced and
  // this org isn't subscribed; it's true/undefined everywhere else.
  const datesLocked = me?.entitlement?.canEditTournamentDates === false;
  const supportEmail = appConfig?.supportEmail ?? null;

  return (
    <Card className="mb-6 p-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(
            {
              name,
              // Omit dates entirely when locked — sending them at all (even
              // unchanged) trips the server's dates_locked guard.
              ...(datesLocked ? {} : { startDate, endDate }),
              location: location.trim() || null,
              status,
              ...(me?.tokensEnabled ? { tokenParticipation, tokenStandingBonuses: tokenBonuses } : {}),
            },
            { onSuccess: onDone },
          );
        }}
      >
        <Field label="Name">
          <TextField required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {datesLocked ? (
          <div className="border-border rounded-md border border-dashed p-4">
            <div className="text-[12px] font-semibold tracking-wide text-ink-muted uppercase">Dates</div>
            <p className="mt-1 text-[14px] text-ink">
              {tournament.startDate.slice(0, 10)}{" "}
              <ArrowRight size={14} className="inline align-[-2px] text-ink-muted" aria-hidden="true" />{" "}
              {tournament.endDate.slice(0, 10)}
            </p>
            <p className="mt-2 text-[12px] text-ink-muted">
              A tournament's dates are fixed once set on this plan.{" "}
              {supportEmail ? (
                <>
                  Need them changed?{" "}
                  <a
                    href={`mailto:${supportEmail}?subject=${encodeURIComponent(`Tournament date change: ${tournament.name}`)}`}
                    className="text-link underline hover:text-link-hover"
                  >
                    Contact support
                  </a>
                  .
                </>
              ) : (
                "Contact the organizer running this instance to change them."
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Start date">
              <TextField type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="End date">
              <TextField type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
        )}
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

        {me?.tokensEnabled && (
          <div className="flex flex-col gap-3 rounded-md border border-border bg-bg p-4">
            <div className="text-[12px] font-semibold tracking-wide text-ink-muted uppercase">
              Token rewards (default for this tournament's pods)
            </div>
            <Field label="Participation — tokens for playing in a pod">
              <TextField
                type="number"
                min={0}
                value={tokenParticipation}
                onChange={(e) => setTokenParticipation(Number(e.target.value))}
                className="w-28"
              />
            </Field>
            <StandingBonusEditor rows={tokenBonuses} onChange={setTokenBonuses} />
          </div>
        )}

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

// PI-140 — the tournament's two free-text fields share one tabbed panel, so
// they don't both occupy the page at once. The public description and the
// organizers' private notes are the same *kind* of thing — Markdown blurbs
// about this weekend — so they get the same editor; only who can read them
// differs, which is what the tab labels and the private-tab note carry.
//
// Tab styling mirrors PodTabs (the Entrants/Pairings/Standings row) so the
// two feel like the same control. Local state rather than routes, though:
// these are two panes of one page, not two pages.
const notesTabs = [
  { key: "description", label: "Description" },
  { key: "internal", label: "Internal notes" },
] as const;
type NotesTabKey = (typeof notesTabs)[number]["key"];

const AUTOSAVE_DEBOUNCE_MS = 3000;

// Normalise a textarea's contents to what the field stores: trimmed, and
// empty becomes null (so "  " and "" and null are all the same saved state).
const normaliseNotes = (raw: string): string | null => raw.trim() || null;

// PI-142 — the editing pane for one of the two fields. Autosaves instead of
// offering a Save button: on blur, and on a slow debounce while typing as
// crash/wifi insurance (not per keystroke — see useAutosaveTournamentText for
// why the request rate matters). `saved` is the last value confirmed on the
// server, kept current by the hook's in-place cache update, so it never
// writes back into the textarea mid-type. `initial` is the snapshot from when
// editing began — Revert restores it, the one-level undo that replaces the old
// Cancel (there is no server-side history, so a value already autosaved over
// is gone; Revert only rescues the current editing session).
function NotesEditor({
  tournamentId,
  field,
  saved,
  placeholder,
  onDone,
}: {
  tournamentId: string;
  field: "description" | "internalNotes";
  saved: string | null;
  placeholder: string;
  onDone: () => void;
}) {
  const autosave = useAutosaveTournamentText(tournamentId);
  const [text, setText] = useState(saved ?? "");
  const initialRef = useRef(saved);
  const savedRef = useRef(saved);
  savedRef.current = saved;

  const dirty = normaliseNotes(text) !== saved;

  // Fire a save only when the buffer actually differs from what the server
  // already has, so blur and the debounce can both call this freely.
  const flush = () => {
    const next = normaliseNotes(text);
    if (next === savedRef.current) return;
    autosave.mutate({ field, value: next });
  };

  // Slow debounce: insurance against a crash or a closed laptop mid-edit, not
  // the primary save path. Blur is. Re-armed on every keystroke.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, dirty]);

  const status = autosave.isPending
    ? "Saving…"
    : autosave.isError
      ? "Not saved — will retry"
      : dirty
        ? "Unsaved changes"
        : "Saved";

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={flush}
        placeholder={placeholder}
      />
      <p className="text-[12px] text-ink-muted">
        Supports Markdown — headings, lists, <strong>bold</strong>/<em>italic</em>/<u>underline</u>, tables, and links.
        Saves automatically.
      </p>
      <div className="flex items-center gap-3">
        {/* preventDefault on mousedown keeps focus in the textarea, so the
            button click does NOT trigger the textarea's onBlur first — that
            would fire a second save of the pre-click text and could reorder
            with this one over the wire. The button owns the save instead. */}
        <Button
          variant="primary"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            flush();
            onDone();
          }}
        >
          Done
        </Button>
        <button
          type="button"
          disabled={text === (initialRef.current ?? "")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setText(initialRef.current ?? "");
            if (normaliseNotes(initialRef.current ?? "") !== savedRef.current) {
              autosave.mutate({ field, value: initialRef.current });
            }
          }}
          className="text-[12.5px] tracking-wide text-link uppercase hover:text-link-hover hover:underline disabled:opacity-40"
        >
          Revert
        </button>
        <span className={`text-[11.5px] ${autosave.isError ? "text-critical" : "text-ink-muted"}`} aria-live="polite">
          {status}
        </span>
        {autosave.isError && (
          <button
            type="button"
            onClick={flush}
            className="text-[11.5px] tracking-wide text-link uppercase hover:text-link-hover hover:underline"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

function TournamentNotesSection({ tournament }: { tournament: TournamentDetail }) {
  const [tab, setTab] = useState<NotesTabKey>("description");
  const [editing, setEditing] = useState(false);

  const isInternal = tab === "internal";
  const value = isInternal ? (tournament.internalNotes ?? null) : (tournament.description ?? null);

  // Leaving edit mode on a tab switch is now safe rather than lossy: autosave
  // already persisted the text (the editor flushes on blur, and switching
  // tabs blurs it), so there is no draft to drop or misroute.
  const switchTab = (key: NotesTabKey) => {
    setTab(key);
    setEditing(false);
  };

  const editedLine =
    isInternal && tournament.internalNotesEditedAt
      ? `Last edited ${new Date(tournament.internalNotesEditedAt).toLocaleString()}${
          tournament.internalNotesEditedByName ? ` by ${tournament.internalNotesEditedByName}` : ""
        }`
      : null;

  return (
    <div className="mb-6">
      <div className="mb-3 flex gap-1 border-b border-border text-[12.5px] tracking-wide uppercase">
        {notesTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`px-3 py-2 ${tab === t.key ? "border-b-2 border-accent font-semibold text-ink" : "text-ink-muted hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isInternal && <p className="mb-2 text-[12px] text-ink-muted">Organizers only — never shown on public pages.</p>}

      {editing ? (
        // key: force a fresh editor when the tab changes, so its buffer and
        // Revert snapshot re-seed from the other field rather than carrying over.
        <NotesEditor
          key={tab}
          tournamentId={tournament.id}
          field={isInternal ? "internalNotes" : "description"}
          saved={value}
          placeholder={
            isInternal
              ? "Rulings, table restarts, who turned up late…\n\nMarkdown supported: # headings, - lists, **bold**, *italic*, tables, [links](https://…)."
              : "Venue notes, format explainer, schedule…\n\nMarkdown supported: # headings, - lists, **bold**, *italic*, tables, [links](https://…)."
          }
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
          {value ? (
            <RichText text={value} />
          ) : (
            <p className="text-[13px] text-ink-muted">
              {isInternal ? "No internal notes yet." : "No description yet."}
            </p>
          )}
          {editedLine && <p className="mt-1.5 text-[11.5px] text-ink-muted">{editedLine}</p>}
          <button
            onClick={() => setEditing(true)}
            className="mt-1.5 text-[12px] tracking-wide text-link uppercase hover:text-link-hover hover:underline"
          >
            {value
              ? isInternal
                ? "Edit notes"
                : "Edit description"
              : isInternal
                ? "+ Add notes"
                : "+ Add description"}
          </button>
        </>
      )}
    </div>
  );
}

const podFormats: PodFormat[] = ["DRAFT", "SEALED", "CHAOS_DRAFT", "CONSTRUCTED", "CUSTOM"];

function NewPodForm({
  tournamentId,
  nextSequenceOrder,
  onCreated,
}: {
  tournamentId: string;
  nextSequenceOrder: number;
  onCreated: () => void;
}) {
  const createPod = useCreatePod(tournamentId);
  const { data: me } = useMe();
  const [name, setName] = useState("");
  const [format, setFormat] = useState<PodFormat>("DRAFT");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [isOnDemand, setIsOnDemand] = useState(false);
  const [capacity, setCapacity] = useState("");
  const [isTeamEvent, setIsTeamEvent] = useState(false);
  const [tokenOverride, setTokenOverride] = useState(false);
  const [podTokenParticipation, setPodTokenParticipation] = useState(0);
  const [podTokenBonuses, setPodTokenBonuses] = useState<StandingBonusRow[]>([]);
  const [teamSize, setTeamSize] = useState(2);
  const [roundCount, setRoundCount] = useState(3);
  const [matchFormat, setMatchFormat] = useState<"BO1" | "BO3">("BO3");
  const [pointsWin, setPointsWin] = useState(3);
  const [pointsDraw, setPointsDraw] = useState(1);
  const [pointsLoss, setPointsLoss] = useState(0);
  const [roundLengthMinutes, setRoundLengthMinutes] = useState(50);
  const [isMainEvent, setIsMainEvent] = useState(false);
  const [excludeFromStats, setExcludeFromStats] = useState(false);
  const [rarePicksEnabled, setRarePicksEnabled] = useState(true);
  const [webhookEnabled, setWebhookEnabled] = useState(true);
  const [setCode, setSetCode] = useState("");
  const [constructedFormat, setConstructedFormat] = useState<ConstructedFormat | "">("");
  const [constructedFormatCustom, setConstructedFormatCustom] = useState("");

  return (
    <Card className="p-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          createPod.mutate(
            {
              name,
              format,
              sequenceOrder: nextSequenceOrder,
              date: date || undefined,
              startTime: date && startTime ? startTime : undefined,
              isOnDemand,
              capacity: isOnDemand && capacity ? Number(capacity) : undefined,
              isTeamEvent,
              teamSize: isTeamEvent ? teamSize : undefined,
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
              setCode: setCode || undefined,
              constructedFormat: format === "CONSTRUCTED" && constructedFormat ? constructedFormat : undefined,
              constructedFormatCustom:
                format === "CONSTRUCTED" && constructedFormat === "CUSTOM"
                  ? constructedFormatCustom || undefined
                  : undefined,
              ...(me?.tokensEnabled && tokenOverride
                ? { tokenParticipation: podTokenParticipation, tokenStandingBonuses: podTokenBonuses }
                : {}),
            },
            { onSuccess: onCreated },
          );
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date" hint="Optional">
            <TextField type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Start time" hint="Optional">
            <TextField type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={!date} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-[13px] text-ink-muted">
          <input
            type="checkbox"
            checked={isOnDemand}
            onChange={(e) => {
              const on = e.target.checked;
              setIsOnDemand(on);
              // PI-100 — a draft on-demand pod almost always seats 8; prefill it.
              if (on && !capacity && (format === "DRAFT" || format === "CHAOS_DRAFT")) setCapacity("8");
            }}
          />
          On demand — not part of the planned schedule (a spontaneous pod, e.g. an impromptu Chaosdraft)
        </label>
        {isOnDemand && (
          <Field label="Capacity" hint="Optional — the target headcount for the “ready” cue">
            <TextField
              type="number"
              min={1}
              max={64}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="e.g. 8"
            />
          </Field>
        )}

        {(format === "DRAFT" || format === "SEALED") && <SetPicker value={setCode} onChange={setSetCode} />}
        {format === "CONSTRUCTED" && (
          <ConstructedFormatPicker
            value={constructedFormat}
            customValue={constructedFormatCustom}
            onChange={setConstructedFormat}
            onCustomChange={setConstructedFormatCustom}
          />
        )}

        <label className="flex items-center gap-2 text-[13px] text-ink-muted">
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

        <label className="flex items-center gap-2 text-[13px] text-ink-muted">
          <input type="checkbox" checked={isMainEvent} onChange={(e) => setIsMainEvent(e.target.checked)} />
          Mark as this tournament's main event — the pod winner earns a crown on the Hall of Fame (only one pod per
          tournament can be the main event; checking this unchecks any other)
        </label>

        <details>
          <summary className="cursor-pointer text-[12.5px] tracking-wide text-ink-muted uppercase select-none">
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
              <TextField
                type="number"
                min={0}
                value={pointsWin}
                onChange={(e) => setPointsWin(Number(e.target.value))}
              />
            </Field>
            <Field label="Points — draw">
              <TextField
                type="number"
                min={0}
                value={pointsDraw}
                onChange={(e) => setPointsDraw(Number(e.target.value))}
              />
            </Field>
            <Field label="Points — loss">
              <TextField
                type="number"
                min={0}
                value={pointsLoss}
                onChange={(e) => setPointsLoss(Number(e.target.value))}
              />
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

          <div className="mt-4 flex flex-col gap-3">
            <label className="flex items-center gap-2 text-[13px] text-ink-muted">
              <input
                type="checkbox"
                checked={rarePicksEnabled}
                onChange={(e) => setRarePicksEnabled(e.target.checked)}
              />
              Track rare picks (card values) for this pod
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-muted">
              <input
                type="checkbox"
                checked={excludeFromStats}
                onChange={(e) => setExcludeFromStats(e.target.checked)}
              />
              Exclude from org-wide stats (Hall of Fame, Treasure Chest) — for one-off, joke, or test pods
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-muted">
              <input type="checkbox" checked={webhookEnabled} onChange={(e) => setWebhookEnabled(e.target.checked)} />
              Send events to the org's configured webhook for this pod (Settings → Webhook)
            </label>

            {me?.tokensEnabled && (
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 text-[13px] text-ink-muted">
                  <input type="checkbox" checked={tokenOverride} onChange={(e) => setTokenOverride(e.target.checked)} />
                  Override the tournament's token rewards for this pod
                </label>
                {tokenOverride && (
                  <div className="flex flex-col gap-3 rounded-md border border-border bg-bg p-3">
                    <Field label="Participation tokens">
                      <TextField
                        type="number"
                        min={0}
                        value={podTokenParticipation}
                        onChange={(e) => setPodTokenParticipation(Number(e.target.value))}
                        className="w-28"
                      />
                    </Field>
                    <StandingBonusEditor rows={podTokenBonuses} onChange={setPodTokenBonuses} />
                  </div>
                )}
              </div>
            )}
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
  // Pick up players self-checking in/out (PI-52) and any pod result that moves
  // the tournament-wide standings, without a manual refresh.
  useTournamentRealtime(id);
  const exportXlsx = useExportTournamentXlsx(id ?? "");
  const applyPass = useApplyPass(id ?? "");
  const reorderPods = useReorderPods(id ?? "");
  const [showPodForm, setShowPodForm] = useState(false);
  const [editingTournament, setEditingTournament] = useState(false);
  const [sharing, setSharing] = useState(false);

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!data) return <p className="text-ink-muted">Tournament not found.</p>;

  const { tournament } = data;

  return (
    <div>
      <Eyebrow>Tournament overview</Eyebrow>
      <ScreenTitle>{tournament.name}</ScreenTitle>
      <ScreenDek>
        {tournament.pods.length === 0
          ? "No pods yet — add one to start pairing."
          : tournament.playersPlayed === 0
            ? `${tournament.pods.length} pod${tournament.pods.length === 1 ? "" : "s"} scheduled · not started yet`
            : `${tournament.pods.length} pod${tournament.pods.length === 1 ? "" : "s"} · ${tournament.playersPlayed} player${tournament.playersPlayed === 1 ? "" : "s"} played`}
      </ScreenDek>

      <div className="mb-6 flex flex-wrap items-center gap-5">
        {!editingTournament && (
          <button
            onClick={() => setEditingTournament(true)}
            className="text-[12.5px] tracking-wide text-link uppercase hover:text-link-hover hover:underline"
          >
            Edit tournament
          </button>
        )}
        <DeleteTournamentButton tournament={tournament} />
      </div>
      {editingTournament && <EditTournamentForm tournament={tournament} onDone={() => setEditingTournament(false)} />}

      {/* HI-9 rule 3 — apply a banked pass to this (free-covered) tournament,
          reclaiming the free slot. Only on a hosted instance, only when a pass
          is available and this tournament is still on the free slot. */}
      {me?.entitlement?.enforced &&
        (me.entitlement.unusedPasses ?? 0) > 0 &&
        tournament.coveringEntitlement === "FREE" && (
          <Card className="mb-6 border-accent/40 bg-bg p-4">
            <div className="text-[14px] font-semibold text-ink">Upgrade this tournament with a pass</div>
            <p className="mt-1 text-[13px] text-ink-muted">
              You have {me.entitlement.unusedPasses} unused tournament{" "}
              {me.entitlement.unusedPasses === 1 ? "pass" : "passes"}. Applying one here unlocks unlimited pods for this
              tournament and returns your free-tournament slot, so you can still run a separate free event.
            </p>
            <Button
              variant="primary"
              className="mt-3"
              disabled={applyPass.isPending}
              onClick={() => applyPass.mutate()}
            >
              {applyPass.isPending ? "Applying…" : "Use a pass on this tournament"}
            </Button>
            {applyPass.isError && <FormError>Couldn't apply the pass — try again.</FormError>}
          </Card>
        )}

      <TournamentNotesSection tournament={tournament} />

      {tournament.playersPlayed > 0 && (
        <div className="mb-6 flex gap-5">
          <Link
            to={`/tournaments/${tournament.id}/gesamtwertung`}
            className="inline-flex items-center gap-1.5 text-[12.5px] tracking-wide text-accent uppercase hover:text-accent-hover"
          >
            View standings <ArrowRight size={13} aria-hidden="true" />
          </Link>
          <Link
            to={`/tournaments/${tournament.id}/value`}
            className="inline-flex items-center gap-1.5 text-[12.5px] tracking-wide text-accent uppercase hover:text-accent-hover"
          >
            Best pulls of the tournament <ArrowRight size={13} aria-hidden="true" />
          </Link>
          {me && (
            <button
              onClick={() => setSharing(true)}
              className="inline-flex items-center gap-1.5 text-[12.5px] tracking-wide text-ink-muted uppercase hover:text-ink"
            >
              Share public link <ExternalLink size={13} aria-hidden="true" />
            </button>
          )}
          {me && (
            <button
              onClick={() => exportXlsx.mutate()}
              disabled={exportXlsx.isPending}
              className="inline-flex items-center gap-1.5 text-[12.5px] tracking-wide text-ink-muted uppercase hover:text-ink disabled:opacity-50"
            >
              {exportXlsx.isPending ? (
                "Preparing…"
              ) : (
                <>
                  Export spreadsheet <Download size={13} aria-hidden="true" />
                </>
              )}
            </button>
          )}
          {me && sharing && (
            <SharePopup
              title="Share this tournament"
              path={`/o/${me.organization.slug}/tournaments/${tournament.id}`}
              onClose={() => setSharing(false)}
            />
          )}
        </div>
      )}

      <PodList
        podsManuallyReordered={tournament.podsManuallyReordered}
        pods={tournament.pods}
        podHref={(pod) => `/pods/${pod.id}`}
        reorder={{ onReorder: (podIds) => reorderPods.mutate(podIds), pending: reorderPods.isPending }}
      />

      {!showPodForm && <Button onClick={() => setShowPodForm(true)}>+ New pod</Button>}
      {showPodForm && (
        <div className="flex flex-col gap-3">
          <NewPodForm
            tournamentId={tournament.id}
            nextSequenceOrder={tournament.pods.length}
            onCreated={() => setShowPodForm(false)}
          />
          <Button variant="ghost" onClick={() => setShowPodForm(false)} className="self-start">
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
