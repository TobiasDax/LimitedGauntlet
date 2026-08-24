import { Link, Outlet, useNavigate } from "react-router-dom";
import { useLogout, useMe } from "../features/auth/useAuth";
import { Button } from "./ui";

export function Layout() {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <div className="border-border sticky top-0 z-10 border-b bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-7 gap-y-2 px-4 py-3 sm:px-8 sm:py-3.5">
          <Link to="/" className="font-display flex items-baseline gap-2.5 text-[17px] font-bold whitespace-nowrap sm:text-[19px]">
            <span className="from-accent-strong to-accent inline-block h-5 w-5 rounded bg-gradient-to-br shadow-[inset_0_0_0_1px_rgba(0,0,0,0.3)]" />
            LimitedGauntlet
          </Link>

          {me && (
            <div className="border-border hidden flex-col gap-px border-l pl-5 sm:flex">
              <span className="text-[13px] text-ink-secondary">{me.organization.name}</span>
            </div>
          )}

          {me && (
            <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto sm:overflow-visible">
              <Link
                to="/"
                className="shrink-0 rounded px-3 py-1.5 text-[12.5px] tracking-wide text-ink-secondary uppercase hover:bg-surface-raised hover:text-ink"
              >
                Tournaments
              </Link>
              <Link
                to="/roster"
                className="shrink-0 rounded px-3 py-1.5 text-[12.5px] tracking-wide text-ink-secondary uppercase hover:bg-surface-raised hover:text-ink"
              >
                Roster
              </Link>
              <Link
                to="/hall-of-fame"
                className="shrink-0 rounded px-3 py-1.5 text-[12.5px] tracking-wide text-ink-secondary uppercase hover:bg-surface-raised hover:text-ink"
              >
                Hall of Fame
              </Link>
              <Link
                to="/treasure-chest"
                className="shrink-0 rounded px-3 py-1.5 text-[12.5px] tracking-wide text-ink-secondary uppercase hover:bg-surface-raised hover:text-ink"
              >
                Treasure Chest
              </Link>
            </nav>
          )}

          <div className="ml-auto flex items-center gap-3">
            {me && (
              <Link
                to="/api-tokens"
                className="text-[12.5px] tracking-wide text-ink-secondary uppercase hover:text-ink"
              >
                API Tokens
              </Link>
            )}
            {me ? (
              <Button
                variant="ghost"
                onClick={() => {
                  logout.mutate(undefined, { onSuccess: () => navigate("/login") });
                }}
              >
                Log out
              </Button>
            ) : (
              <Link to="/login" className="text-[12.5px] tracking-wide text-ink-secondary uppercase hover:text-ink">
                Log in
              </Link>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1180px] px-4 pb-24 pt-8 sm:px-8 sm:pt-10">
        <Outlet />
      </main>
    </div>
  );
}
