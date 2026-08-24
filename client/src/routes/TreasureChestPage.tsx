import { useTreasureChest } from "../features/pods/useCardPulls";
import { CardGallery } from "../components/CardGallery";
import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";

export function TreasureChestPage() {
  const { data, isLoading } = useTreasureChest();

  return (
    <div>
      <Eyebrow>Your organization</Eyebrow>
      <ScreenTitle>Treasure Chest</ScreenTitle>
      <ScreenDek>The biggest pulls across every tournament this group has ever run.</ScreenDek>

      {isLoading ? (
        <p className="text-ink-muted">Loading…</p>
      ) : (
        <CardGallery pulls={data?.cardPulls ?? []} tournamentLink />
      )}
    </div>
  );
}
