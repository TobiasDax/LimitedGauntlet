import { useParams } from "react-router-dom";
import { usePublicHallOfFame } from "../features/public/usePublic";
import { HeadlineStats, HallOfFameList, MostPlayedPairings, BiggestPulls } from "../components/HallOfFameOverview";
import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";

export function PublicHallOfFamePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading } = usePublicHallOfFame(slug);

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!data) return <p className="text-ink-muted">Not found.</p>;

  return (
    <div>
      <Eyebrow>{data.organization.name}</Eyebrow>
      <ScreenTitle>Hall of Fame</ScreenTitle>
      <ScreenDek>
        All-time player standings across every tournament this group has ever run — ranked by average points per pod,
        so attending fewer events isn't penalized. Click a player for the deep dive.
      </ScreenDek>

      {data.hallOfFame.length === 0 ? (
        <p className="text-ink-muted">No results yet.</p>
      ) : (
        <>
          <HeadlineStats
            headline={data.headline}
            longestWinStreak={data.longestWinStreak}
            playerLinkTo={(id) => `/o/${slug}/hall-of-fame/players/${id}`}
          />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            <HallOfFameList
              rows={data.hallOfFame}
              playerLinkTo={(id) => `/o/${slug}/hall-of-fame/players/${id}`}
              mainEventLinkTo={(win) => `/o/${slug}/tournaments/${win.tournamentId}/pods/${win.podId}`}
            />
            <div className="flex flex-col gap-4">
              <MostPlayedPairings pairings={data.mostPlayedPairings} />
              <BiggestPulls pulls={data.biggestPulls} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
