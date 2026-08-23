import { Link, useLocation } from "react-router-dom";

const tabs = [
  { suffix: "", label: "Entrants" },
  { suffix: "/rounds", label: "Pairings" },
  { suffix: "/standings", label: "Standings" },
  { suffix: "/value", label: "Value" },
];

export function PodTabs({ podId }: { podId: string }) {
  const { pathname } = useLocation();
  const base = `/pods/${podId}`;

  return (
    <div className="mb-6 flex gap-1 border-b border-border">
      {tabs.map((tab) => {
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
