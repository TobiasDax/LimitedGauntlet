import type { CardPull } from "../lib/types";

export function formatEur(value: number | null): string {
  return value === null ? "—" : `€${value.toFixed(2)}`;
}

export function CardGallery({ pulls, onRemove }: { pulls: CardPull[]; onRemove?: (id: string) => void }) {
  if (pulls.length === 0) {
    return <p className="text-[13px] text-ink-muted">No pulls recorded yet.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {pulls.map((pull) => (
        <div key={pull.id} className="overflow-hidden rounded-[10px] border border-border-strong bg-surface">
          <div className="relative aspect-[5/7] bg-surface-sunken">
            {pull.imageUri ? (
              <img src={pull.imageUri} alt={pull.cardName} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="grid h-full w-full place-items-center text-[11px] text-ink-muted">No image</div>
            )}
            {onRemove && (
              <button
                onClick={() => onRemove(pull.id)}
                title="Remove"
                className="absolute top-1.5 right-1.5 grid h-6 w-6 place-items-center rounded bg-black/65 text-[12px] text-white hover:bg-black/85"
              >
                ✕
              </button>
            )}
          </div>
          <div className="p-2.5">
            <div className="font-display mb-1 text-[13px] leading-tight font-bold">{pull.cardName}</div>
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-bold text-accent-strong tabular-nums">{formatEur(pull.priceEur)}</span>
              {pull.setCode && (
                <span className="text-[10px] tracking-wide text-ink-muted uppercase">{pull.setCode}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
