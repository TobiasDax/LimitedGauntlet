import { Link, Outlet, useNavigate } from "react-router-dom";
import { useLogout, useMe } from "../features/auth/useAuth";
import { Button } from "./ui";
import { TopBar, type NavItem } from "./TopBar";
import { Footer } from "./Footer";

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Tournaments", end: true },
  { to: "/roster", label: "Roster" },
  { to: "/hall-of-fame", label: "Hall of Fame" },
  { to: "/treasure-chest", label: "Treasure Chest" },
];

export function Layout() {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  const rightSlot = me ? (
    <>
      <Link
        to="/settings"
        className="text-[12.5px] tracking-wide text-ink-secondary uppercase hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Settings
      </Link>
      <Button
        variant="ghost"
        onClick={() => {
          logout.mutate(undefined, { onSuccess: () => navigate("/login") });
        }}
      >
        Log out
      </Button>
    </>
  ) : (
    <Link
      to="/login"
      className="text-[12.5px] tracking-wide text-ink-secondary uppercase hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      Log in
    </Link>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        brandTo="/"
        orgName={me?.organization.name}
        navItems={me ? NAV_ITEMS : []}
        rightSlot={rightSlot}
      />

      <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-24 pt-8 sm:px-8 sm:pt-10">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
