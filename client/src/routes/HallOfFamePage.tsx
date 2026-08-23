import { useHallOfFame } from "../features/pods/useCardPulls";
import { CardGallery } from "../components/CardGallery";
import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";

export function HallOfFamePage() {
  const { data, isLoading } = useHallOfFame();

  return (
    <div>
      <Eyebrow>Your organization</Eyebrow>
      <ScreenTitle>Hall of Fame</ScreenTitle>
      <ScreenDek>The biggest pulls across every tournament this group has ever run.</ScreenDek>

      {isLoading ? <p className="text-ink-muted">Loading…</p> : <CardGallery pulls={data?.cardPulls ?? []} />}
    </div>
  );
}
