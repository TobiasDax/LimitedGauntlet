import { useState } from "react";
import { useTreasureChest } from "../features/pods/useCardPulls";
import { useMe } from "../features/auth/useAuth";
import { CardGallery } from "../components/CardGallery";
import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";
import { SharePopup } from "../components/SharePopup";

export function TreasureChestPage() {
  const { data, isLoading } = useTreasureChest();
  const { data: me } = useMe();
  const [sharing, setSharing] = useState(false);

  return (
    <div>
      <Eyebrow>Your organization</Eyebrow>
      <ScreenTitle>Treasure Chest</ScreenTitle>
      <ScreenDek>The biggest pulls across every tournament this group has ever run.</ScreenDek>

      {me && (
        <button
          onClick={() => setSharing(true)}
          className="mb-6 inline-block text-[12.5px] tracking-wide text-ink-secondary uppercase hover:text-ink"
        >
          Share public link ↗
        </button>
      )}
      {me && sharing && (
        <SharePopup
          title="Share the Treasure Chest"
          path={`/o/${me.organization.slug}/treasure-chest`}
          onClose={() => setSharing(false)}
        />
      )}

      {isLoading ? (
        <p className="text-ink-muted">Loading…</p>
      ) : (
        <CardGallery pulls={data?.cardPulls ?? []} tournamentLinkTo={(id) => `/tournaments/${id}`} />
      )}
    </div>
  );
}
