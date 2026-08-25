import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { Logo } from "./Logo";

export interface NavItem {
  to: string;
  label: string;
  // `end` makes the link active only on an exact path match — needed for the
  // "home" link (`/` or `/o/:slug`), which is otherwise a prefix of every route.
  end?: boolean;
}

// Active nav item gets the accent color, bold, and an underline (PI-24);
// inactive items stay muted. `focus-visible` gives keyboard users a real
// focus ring (the mouse-click outline is suppressed by focus-visible, not
// stripped outright). NavLink sets aria-current="page" on the active item
// automatically, so assistive tech announces the current page.
function navLinkClass({ isActive }: { isActive: boolean }): string {
  return [
    "shrink-0 rounded px-3 py-1.5 text-[12.5px] tracking-wide uppercase transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    isActive
      ? "font-bold text-accent underline decoration-2 underline-offset-[6px]"
      : "text-ink-secondary hover:bg-surface-raised hover:text-ink",
  ].join(" ");
}

// Shared top bar for the authed Layout and the public PublicLayout. On desktop
// the nav + right slot sit inline; below `sm:` they collapse into a hamburger
// (PI-25) that drops a full-width menu panel, keeping the bar compact on a phone.
export function TopBar({
  brandTo,
  orgName,
  navItems,
  rightSlot,
}: {
  brandTo: string;
  orgName?: string;
  navItems: NavItem[];
  rightSlot?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Close the mobile menu on Escape and on an outside click (PI-25 a11y).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div className="border-border sticky top-0 z-30 border-b bg-bg/85 backdrop-blur">
      <div
        ref={barRef}
        className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-7 gap-y-2 px-4 py-3 sm:px-8 sm:py-3.5"
      >
        <Link
          to={brandTo}
          className="font-display flex items-center gap-2.5 text-[17px] font-bold whitespace-nowrap sm:text-[19px]"
        >
          <Logo className="h-7 w-7" />
          LimitedGauntlet
        </Link>

        {orgName && (
          <div className="border-border hidden flex-col gap-px border-l pl-5 sm:flex">
            <span className="text-[13px] text-ink-secondary">{orgName}</span>
          </div>
        )}

        {/* Desktop nav */}
        <nav className="hidden gap-1 sm:flex" aria-label="Primary">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Desktop right slot */}
        {rightSlot && <div className="ml-auto hidden items-center gap-3 sm:flex">{rightSlot}</div>}

        {/* Mobile hamburger toggle */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="ml-auto rounded p-2 text-ink-secondary hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:hidden"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            )}
          </svg>
        </button>

        {/* Mobile menu panel */}
        {open && (
          <nav
            id="mobile-nav"
            className="order-last flex w-full flex-col gap-1 pt-1 sm:hidden"
            aria-label="Primary"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={navLinkClass}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
            {rightSlot && (
              <div className="border-border mt-1 flex items-center gap-3 border-t pt-2" onClick={() => setOpen(false)}>
                {rightSlot}
              </div>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
