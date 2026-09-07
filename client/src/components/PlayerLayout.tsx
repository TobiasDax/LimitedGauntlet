import { Link, Navigate, Outlet, useNavigate, useParams } from "react-router-dom";
import { usePlayerMe, usePlayerLogout, usePlayerSwitchOrg } from "../features/player/usePlayer";
import { Button } from "./ui";
import { TopBar } from "./TopBar";
import { Footer } from "./Footer";

// PI-86 — switch which org's portal this player session is in; the URL slug
// follows. Plain <select> to keep the player chrome minimal.
function PlayerOrgSwitcher() {
  const { data: me } = usePlayerMe();
  const switchOrg = usePlayerSwitchOrg();
  const orgs = me?.organizations ?? [];
  if (!me || orgs.length <= 1) {
    return (
      <span className="text-[13px] text-ink-secondary">
        {me ? `${me.organization.name} · Player` : "Player sign-in"}
      </span>
    );
  }
  return (
    <select
      aria-label="Organization"
      disabled={switchOrg.isPending}
      value={me.organization.slug}
      onChange={(e) => switchOrg.mutate(e.target.value)}
      className="border-border-strong rounded border bg-surface px-2 py-1 text-[13px] text-ink-secondary"
    >
      {orgs.map((o) => (
        <option key={o.slug} value={o.slug}>
          {o.name} · Player
        </option>
      ))}
    </select>
  );
}

// Chrome for the self-service player portal (PI-52), mounted at
// /o/:slug/player/*. Independent of PublicLayout — no public-lock gate here
// (a player logging in is itself the authentication), and its own minimal
// top bar. The login child renders for a logged-out visitor; everything
// else bounces to it.
export function PlayerLayout() {
  const { slug } = useParams<{ slug: string }>();
  const { data: me, isLoading } = usePlayerMe();
  const logout = usePlayerLogout();
  const navigate = useNavigate();
  const base = `/o/${slug}/player`;

  if (isLoading) return <div className="min-h-screen" />;

  const rightSlot = me ? (
    <Button variant="ghost" onClick={() => logout.mutate(undefined, { onSuccess: () => navigate(`${base}/login`) })}>
      Log out
    </Button>
  ) : (
    <Link
      to={`/o/${slug}`}
      className="text-[12.5px] tracking-wide text-ink-secondary uppercase hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      Public page
    </Link>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        brandTo={me ? base : `${base}/login`}
        orgSlot={<PlayerOrgSwitcher />}
        navItems={[]}
        rightSlot={rightSlot}
      />
      <main className="mx-auto w-full max-w-[720px] flex-1 px-4 pb-24 pt-8 sm:px-8 sm:pt-10">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

// Guards the portal itself — redirect a logged-out visitor to the login page.
export function PlayerProtectedRoute() {
  const { slug } = useParams<{ slug: string }>();
  const { data: me, isLoading } = usePlayerMe();
  if (isLoading) return <div className="py-20 text-center text-ink-muted">Loading…</div>;
  if (!me) return <Navigate to={`/o/${slug}/player/login`} replace />;
  return <Outlet />;
}
