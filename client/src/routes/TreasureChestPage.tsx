import { useTreasureChest } from "../features/pods/useCardPulls";
import { useMe } from "../features/auth/useAuth";
import { CardGallery } from "../components/CardGallery";
import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";

export function TreasureChestPage() {
  const { data, isLoading } = useTreasureChest();
  const { data: me } = useMe();

  return (
    <div>
      <Eyebrow>Your organization</Eyebrow>
      <ScreenTitle>Treasure Chest</ScreenTitle>
      <ScreenDek>The biggest pulls across every tournament this group has ever run.</ScreenDek>

      {me && (
        <a
          href={`/o/${me.organization.slug}/treasure-chest`}
          target="_blank"
          rel="noreferrer"
          className="mb-6 inline-block text-[12.5px] tracking-wide text-ink-secondary uppercase hover:text-ink"
        >
          Public link ↗
        </a>
      )}

      {isLoading ? (
        <p className="text-ink-muted">Loading…</p>
      ) : (
        <CardGallery pulls={data?.cardPulls ?? []} tournamentLinkTo={(id) => `/tournaments/${id}`} />
      )}
    </div>
  );
}
