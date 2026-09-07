import { Link } from "react-router-dom";
import { useMe } from "../features/auth/useAuth";
import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";
import { SettingsSection } from "../components/settings/SettingsSection";
import { ProfileSection } from "../components/settings/ProfileSection";

// PI-87 — identity-scoped settings, split out of the old combined Settings
// page. Org-scoped config lives on /settings (which acts on the active org);
// this page is the same wherever you are, so it's reachable even with no
// active org (ProtectedRoute exempts it).
export function ProfilePage() {
  const { data: me } = useMe();
  const orgCount = me?.organizations?.length ?? 0;
  return (
    <div>
      <Eyebrow>Your account</Eyebrow>
      <ScreenTitle>Profile</ScreenTitle>
      <ScreenDek>Your login — the same across every organization you belong to.</ScreenDek>

      <SettingsSection title="Sign-in" description="Change the email you sign in with, or set / change your password.">
        <ProfileSection />
      </SettingsSection>

      <SettingsSection
        title="Organizations"
        description="Organization settings — tokens, webhooks, co-organizers, leaving or deleting an org — live on the Settings page for whichever organization you're currently in."
      >
        <p className="text-[13px] text-ink-secondary">
          You belong to {orgCount} {orgCount === 1 ? "organization" : "organizations"}.{" "}
          <Link to="/organizations" className="text-link underline hover:text-link-strong">
            Manage them
          </Link>
          .
        </p>
      </SettingsSection>
    </div>
  );
}
