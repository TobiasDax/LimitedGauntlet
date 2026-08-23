import { Outlet } from "react-router-dom";

// No auth-dependent chrome here on purpose — this is the shareable-link
// surface (replaces the old Outline doc links), viewable by anyone with
// the URL, no login involved.
export function PublicLayout() {
  return (
    <div className="min-h-screen">
      <div className="border-border sticky top-0 z-10 border-b bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-2.5 px-8 py-3.5">
          <span className="from-accent-strong to-accent inline-block h-5 w-5 rounded bg-gradient-to-br shadow-[inset_0_0_0_1px_rgba(0,0,0,0.3)]" />
          <span className="font-display text-[19px] font-bold">LimitedGauntlet</span>
        </div>
      </div>

      <main className="mx-auto max-w-[1180px] px-8 pb-24 pt-10">
        <Outlet />
      </main>
    </div>
  );
}
