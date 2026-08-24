import { Link, Outlet, useParams } from "react-router-dom";
import { usePublicOrganization } from "../features/public/usePublic";
import { Logo } from "./Logo";

// The shareable-link surface (replaces the old Outline doc links) — one
// link per org, viewable by anyone with the URL, no login involved. Nav
// mirrors the authed Layout's (Tournaments/Roster/Hall of Fame/Treasure
// Chest) minus anything that manages data (no API Tokens, no Log out,
// no create/edit/delete anywhere under this layout) — this is a read-only
// mirror of what the organizer sees, not the organizer's own view.
export function PublicLayout() {
  const { slug } = useParams<{ slug: string }>();
  const { data } = usePublicOrganization(slug);

  return (
    <div className="min-h-screen">
      <div className="border-border sticky top-0 z-10 border-b bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-7 gap-y-2 px-4 py-3 sm:px-8 sm:py-3.5">
          <Link to={`/o/${slug}`} className="font-display flex items-center gap-2.5 text-[17px] font-bold whitespace-nowrap sm:text-[19px]">
            <Logo className="h-7 w-7" />
            LimitedGauntlet
          </Link>

          {data && (
            <div className="border-border hidden flex-col gap-px border-l pl-5 sm:flex">
              <span className="text-[13px] text-ink-secondary">{data.organization.name}</span>
            </div>
          )}

          <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto sm:overflow-visible">
            <Link
              to={`/o/${slug}`}
              className="shrink-0 rounded px-3 py-1.5 text-[12.5px] tracking-wide text-ink-secondary uppercase hover:bg-surface-raised hover:text-ink"
            >
              Tournaments
            </Link>
            <Link
              to={`/o/${slug}/roster`}
              className="shrink-0 rounded px-3 py-1.5 text-[12.5px] tracking-wide text-ink-secondary uppercase hover:bg-surface-raised hover:text-ink"
            >
              Roster
            </Link>
            <Link
              to={`/o/${slug}/hall-of-fame`}
              className="shrink-0 rounded px-3 py-1.5 text-[12.5px] tracking-wide text-ink-secondary uppercase hover:bg-surface-raised hover:text-ink"
            >
              Hall of Fame
            </Link>
            <Link
              to={`/o/${slug}/treasure-chest`}
              className="shrink-0 rounded px-3 py-1.5 text-[12.5px] tracking-wide text-ink-secondary uppercase hover:bg-surface-raised hover:text-ink"
            >
              Treasure Chest
            </Link>
          </nav>
        </div>
      </div>

      <main className="mx-auto max-w-[1180px] px-4 pb-24 pt-8 sm:px-8 sm:pt-10">
        <Outlet />
      </main>
    </div>
  );
}
