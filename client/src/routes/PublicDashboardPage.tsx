import { Link, useParams } from "react-router-dom";
import { usePublicOrganization } from "../features/public/usePublic";
import { Card, Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";
import type { TournamentStatus } from "../lib/types";

const statusLabel: Record<TournamentStatus, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  COMPLETED: "Completed",
};

function formatDateRange(start: string, end: string): string {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

// The org landing page — this is what "send one link" actually lands on.
// Read-only mirror of DashboardPage: same tournament list, no create form.
export function PublicDashboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading } = usePublicOrganization(slug);

  return (
    <div>
      <Eyebrow>{data?.organization.name ?? "Organization"}</Eyebrow>
      <ScreenTitle>Tournaments</ScreenTitle>
      <ScreenDek>Every weekend this group has run.</ScreenDek>

      {isLoading && <p className="text-ink-muted">Loading…</p>}

      {data && data.tournaments.length === 0 && <p className="text-ink-muted">No tournaments yet.</p>}

      {data && data.tournaments.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.tournaments.map((t) => (
            <Link key={t.id} to={`/o/${slug}/tournaments/${t.id}`}>
              <Card className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-surface-raised">
                <div>
                  <div className="font-display text-[17px] font-bold">{t.name}</div>
                  <div className="text-[12.5px] text-ink-muted">
                    {formatDateRange(t.startDate, t.endDate)}
                    {t.location && ` · ${t.location}`}
                  </div>
                </div>
                <span className="text-[11.5px] tracking-wide text-ink-secondary uppercase">{statusLabel[t.status]}</span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
