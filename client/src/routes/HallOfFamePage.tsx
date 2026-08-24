import { useHallOfFame } from "../features/hallOfFame/useHallOfFame";
import { useMe } from "../features/auth/useAuth";
import { HeadlineStats, HallOfFameList, MostPlayedPairings, BiggestPulls } from "../components/HallOfFameOverview";
import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";

export function HallOfFamePage() {
  const { data, isLoading } = useHallOfFame();
  const { data: me } = useMe();

  return (
    <div>
      <Eyebrow>Your organization</Eyebrow>
      <ScreenTitle>Hall of Fame</ScreenTitle>
      <ScreenDek>
        All-time player standings across every tournament this group has ever run — ranked by average points per pod,
        so attending fewer events isn't penalized. Click a player for the deep dive.
      </ScreenDek>

      {me && (
        <a
          href={`/o/${me.organization.slug}/hall-of-fame`}
          target="_blank"
          rel="noreferrer"
          className="mb-6 inline-block text-[12.5px] tracking-wide text-ink-secondary uppercase hover:text-ink"
        >
          Public link ↗
        </a>
      )}

      {isLoading ? (
        <p className="text-ink-muted">Loading…</p>
      ) : !data || data.hallOfFame.length === 0 ? (
        <p className="text-ink-muted">No results yet — play some pods first.</p>
      ) : (
        <>
          <HeadlineStats
            headline={data.headline}
            longestWinStreak={data.longestWinStreak}
            playerLinkTo={(id) => `/hall-of-fame/players/${id}`}
          />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            <HallOfFameList
              rows={data.hallOfFame}
              playerLinkTo={(id) => `/hall-of-fame/players/${id}`}
              mainEventLinkTo={(win) => `/pods/${win.podId}`}
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
