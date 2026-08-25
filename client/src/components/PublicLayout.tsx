import { Outlet, useParams } from "react-router-dom";
import { usePublicOrganization, usePublicLockStatus } from "../features/public/usePublic";
import { PublicUnlockPrompt } from "./PublicUnlockPrompt";
import { TopBar, type NavItem } from "./TopBar";
import { Footer } from "./Footer";

// The shareable-link surface (replaces the old Outline doc links) — one
// link per org, viewable by anyone with the URL, no login involved. Nav
// mirrors the authed Layout's (Tournaments/Roster/Hall of Fame/Treasure
// Chest) minus anything that manages data (no API Tokens, no Log out,
// no create/edit/delete anywhere under this layout) — this is a read-only
// mirror of what the organizer sees, not the organizer's own view.
export function PublicLayout() {
  const { slug } = useParams<{ slug: string }>();
  const { data: lock, isLoading: lockLoading } = usePublicLockStatus(slug);
  const { data } = usePublicOrganization(slug);

  // PI-27: gate the whole public surface behind the org's password when set.
  // Wait for the (fast, ungated) lock check before rendering anything, so a
  // locked page never briefly fires its gated child queries.
  if (lockLoading) return <div className="min-h-screen" />;
  if (lock?.locked && !lock.unlocked) return <PublicUnlockPrompt slug={slug} />;

  const base = `/o/${slug}`;
  const navItems: NavItem[] = [
    { to: base, label: "Tournaments", end: true },
    { to: `${base}/roster`, label: "Roster" },
    { to: `${base}/hall-of-fame`, label: "Hall of Fame" },
    { to: `${base}/treasure-chest`, label: "Treasure Chest" },
  ];

  return (
    <div className="min-h-screen">
      <TopBar brandTo={base} orgName={data?.organization.name} navItems={navItems} />

      <main className="mx-auto max-w-[1180px] px-4 pb-24 pt-8 sm:px-8 sm:pt-10">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
