import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useCreateTournament, useTournaments } from "../features/tournaments/useTournaments";
import { useMe } from "../features/auth/useAuth";
import { Button, Card, Eyebrow, Field, ScreenDek, ScreenTitle, TextField, Textarea } from "../components/ui";
import { SharePopup } from "../components/SharePopup";
import type { TournamentStatus } from "../lib/types";

const statusLabel: Record<TournamentStatus, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  COMPLETED: "Completed",
};

function formatDateRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function DashboardPage() {
  const { data, isLoading } = useTournaments();
  const { data: me } = useMe();
  const createTournament = useCreateTournament();
  const navigate = useNavigate();
  // `?new=paid` is the Settings banner's deep link: open the form already set
  // to spend a bought pass.
  const [searchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(searchParams.has("new"));
  const [paidMode, setPaidMode] = useState(searchParams.get("new") === "paid");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [sharing, setSharing] = useState(false);

  // Hosted-only: a non-subscriber's creation choices depend on whether the free
  // slot is still unspent and whether they hold an unused pass. Self-hosted and
  // Series orgs keep the single plain button.
  const ent = me?.entitlement;
  const hosted = !!ent?.enforced && ent.tier !== "SERIES";
  const passes = ent?.unusedPasses ?? 0;
  const freeAvailable = hosted && !ent?.freeTournamentUsed;

  const openForm = (paid: boolean) => {
    setPaidMode(paid);
    setShowForm(true);
  };

  const newTournamentActions = (first: boolean) => {
    if (!hosted) {
      return (
        <Button variant={first ? "primary" : "default"} onClick={() => openForm(false)}>
          {first ? "Create your first tournament" : "+ New tournament"}
        </Button>
      );
    }
    return (
      <div className={`flex flex-wrap gap-2 ${first ? "justify-center" : ""}`}>
        {freeAvailable && (
          <Button variant="primary" onClick={() => openForm(false)}>
            Create free tournament
          </Button>
        )}
        {passes > 0 ? (
          <Button variant={freeAvailable ? "default" : "primary"} onClick={() => openForm(true)}>
            Create paid tournament
          </Button>
        ) : (
          <Button variant={freeAvailable ? "default" : "primary"} onClick={() => navigate("/settings")}>
            Buy Tournament / Series pass
          </Button>
        )}
      </div>
    );
  };

  return (
    <div>
      <Eyebrow>Your organization</Eyebrow>
      <ScreenTitle>Tournaments</ScreenTitle>
      <ScreenDek>Every weekend your group has run, and the one you're planning next.</ScreenDek>

      {me && (
        <button
          onClick={() => setSharing(true)}
          className="mb-6 inline-flex items-center gap-1.5 text-[12.5px] tracking-wide text-ink-secondary uppercase hover:text-ink"
        >
          Share public link (with your group) <ExternalLink size={13} aria-hidden="true" />
        </button>
      )}
      {me && sharing && (
        <SharePopup
          title="Share your organization"
          path={`/o/${me.organization.slug}`}
          onClose={() => setSharing(false)}
        />
      )}

      {isLoading && <p className="text-ink-muted">Loading…</p>}

      {data && data.tournaments.length === 0 && !showForm && (
        <Card className="p-8 text-center">
          <p className="mb-4 text-ink-secondary">No tournaments yet.</p>
          {newTournamentActions(true)}
          {hosted && passes === 0 && (
            <p className="mt-4 text-[12.5px] text-ink-muted">
              A free tournament includes one pod. A tournament pass unlocks unlimited pods for a tournament; Series
              unlocks unlimited tournaments.
            </p>
          )}
        </Card>
      )}

      {data && data.tournaments.length > 0 && (
        <div className="mb-6 flex flex-col gap-2">
          {data.tournaments.map((t) => (
            <Link key={t.id} to={`/tournaments/${t.id}`}>
              <Card className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-surface-raised">
                <div>
                  <div className="font-display text-[17px] font-bold">{t.name}</div>
                  <div className="text-[12.5px] text-ink-muted">
                    {formatDateRange(t.startDate, t.endDate)}
                    {t.location && ` · ${t.location}`}
                  </div>
                </div>
                <span className="text-[11.5px] tracking-wide text-ink-secondary uppercase">
                  {statusLabel[t.status]}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {data && data.tournaments.length > 0 && !showForm && newTournamentActions(false)}

      {showForm && (
        <Card className="mt-2 p-6">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              createTournament.mutate(
                {
                  name,
                  startDate,
                  endDate,
                  location: location || undefined,
                  description: description.trim() || undefined,
                  usePass: paidMode || undefined,
                },
                {
                  onSuccess: () => {
                    setShowForm(false);
                    setName("");
                    setStartDate("");
                    setEndDate("");
                    setLocation("");
                    setDescription("");
                  },
                },
              );
            }}
          >
            <Field label="Name">
              <TextField
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="2026 - Sommer GP Eichstätt"
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Start date">
                <TextField type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
              <Field label="End date">
                <TextField type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Location" hint="Optional">
              <TextField value={location} onChange={(e) => setLocation(e.target.value)} />
            </Field>
            <Field
              label="Description"
              hint="Optional · Markdown supported (headings, lists, bold/italic, tables, links)"
            >
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Venue notes, format explainer, schedule… Markdown supported."
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={createTournament.isPending}>
                {createTournament.isPending
                  ? "Creating…"
                  : paidMode
                    ? "Create paid tournament"
                    : hosted && freeAvailable
                      ? "Create free tournament"
                      : "Create tournament"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
