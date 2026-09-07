import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMe, useSwitchOrg } from "../features/auth/useAuth";

// PI-86 — the active org, with a dropdown to switch when the login belongs to
// more than one. A single-org login just shows the name (no menu). Sits in the
// TopBar next to the wordmark.
export function OrgSwitcher() {
  const { data: me } = useMe();
  const switchOrg = useSwitchOrg();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!me?.organization) return null;
  const orgs = me.organizations ?? [];

  // Always a menu (even with one org) so "Manage organizations" — the way to
  // create or join another — is always reachable.
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={switchOrg.isPending}
        className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[13px] text-ink-secondary hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {switchOrg.isPending ? "Switching…" : me.organization.name}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="border-border absolute left-0 z-40 mt-1 min-w-[200px] rounded-md border bg-surface py-1 shadow-lg"
        >
          {orgs.map((o) => (
            <button
              key={o.id}
              role="menuitemradio"
              aria-checked={o.id === me.activeOrgId}
              onClick={() => {
                setOpen(false);
                if (o.id !== me.activeOrgId) switchOrg.mutate(o.id);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface-raised"
            >
              <span className="w-3 text-accent">{o.id === me.activeOrgId ? "✓" : ""}</span>
              {o.name}
            </button>
          ))}
          <Link
            to="/organizations"
            onClick={() => setOpen(false)}
            className="border-border mt-1 block border-t px-3 py-2 text-[12px] text-ink-muted hover:text-ink"
          >
            Manage organizations
          </Link>
        </div>
      )}
    </div>
  );
}
