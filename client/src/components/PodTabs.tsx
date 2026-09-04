import { Link, useLocation } from "react-router-dom";
import { usePod } from "../features/pods/usePods";

const tabs = [
  { suffix: "", label: "Entrants" },
  { suffix: "/seating", label: "Seatings" },
  { suffix: "/rounds", label: "Pairings" },
  { suffix: "/standings", label: "Standings" },
  { suffix: "/value", label: "Value" },
];

// PI-79 — the formats where packs (or a sealed pool) actually get seated
// around a physical table; same list `SeatingsPage` gates on.
const seatingFormats = new Set(["DRAFT", "CHAOS_DRAFT", "SEALED"]);

export function PodTabs({ podId }: { podId: string }) {
  const { pathname } = useLocation();
  const { data } = usePod(podId);
  const base = `/pods/${podId}`;

  // PI-66: the Value tab is hidden when rare-picks tracking is off for this
  // pod. PI-80: the Seatings tab only exists for formats with a seating
  // chart. Data is cached (every pod sub-page uses usePod), so no extra fetch.
  let visible = tabs;
  if (data?.pod.rarePicksEnabled === false) visible = visible.filter((t) => t.suffix !== "/value");
  if (data && !seatingFormats.has(data.pod.format)) visible = visible.filter((t) => t.suffix !== "/seating");

  return (
    <div className="mb-6 flex gap-1 border-b border-border">
      {visible.map((tab) => {
        const href = `${base}${tab.suffix}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.suffix}
            to={href}
            className={`-mb-px border-b-2 px-3 py-2 text-[12.5px] tracking-wide uppercase ${
              active ? "border-accent text-ink" : "border-transparent text-ink-secondary hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
