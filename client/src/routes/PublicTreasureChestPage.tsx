import { useParams } from "react-router-dom";
import { usePublicTreasureChest } from "../features/public/usePublic";
import { CardGallery } from "../components/CardGallery";
import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";

export function PublicTreasureChestPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading } = usePublicTreasureChest(slug);

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!data) return <p className="text-ink-muted">Not found.</p>;

  return (
    <div>
      <Eyebrow>{data.organization.name}</Eyebrow>
      <ScreenTitle>Treasure Chest</ScreenTitle>
      <ScreenDek>The biggest pulls across every tournament this group has ever run.</ScreenDek>

      <CardGallery pulls={data.cardPulls} tournamentLinkTo={(id) => `/o/${slug}/tournaments/${id}`} />
    </div>
  );
}
