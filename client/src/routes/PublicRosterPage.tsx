import { useParams } from "react-router-dom";
import { usePublicRoster } from "../features/public/usePublic";
import { Card, Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";

// Read-only mirror of RosterPage — just the names, no add/rename/remove.
export function PublicRosterPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading } = usePublicRoster(slug);

  return (
    <div>
      <Eyebrow>{data?.organization.name ?? "Organization"}</Eyebrow>
      <ScreenTitle>Roster</ScreenTitle>
      <ScreenDek>Everyone who's played with this group.</ScreenDek>

      {isLoading && <p className="text-ink-muted">Loading…</p>}

      {data && data.players.length === 0 && <p className="text-ink-muted">No players yet.</p>}

      {data && data.players.length > 0 && (
        <Card className="divide-y divide-border">
          {data.players.map((p) => (
            <div key={p.id} className="px-5 py-3">
              <span className="font-display text-[15.5px] font-bold">{p.displayName}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
