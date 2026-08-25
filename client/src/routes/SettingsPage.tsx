import { useMe } from "../features/auth/useAuth";
import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";
import { SettingsSection } from "../components/settings/SettingsSection";
import { ApiTokensSection } from "../components/settings/ApiTokensSection";
import { PublicLockSection } from "../components/settings/PublicLockSection";
import { OrganizersSection } from "../components/settings/OrganizersSection";
import { AccountSection } from "../components/settings/AccountSection";

// Organizer settings hub (PI-26). Organizer-only (this route is inside the
// authed/ProtectedRoute block); the API-token routes it drives are themselves
// session-auth-only, never bearer-auth'd. More sections land here: PI-27
// (public-page password lock) and PI-28 (account: email/password/delete).
export function SettingsPage() {
  const { data: me } = useMe();
  return (
    <div>
      <Eyebrow>Your organization</Eyebrow>
      <ScreenTitle>Settings</ScreenTitle>
      <ScreenDek>Manage your organization and account.</ScreenDek>

      <SettingsSection
        title="Public page access"
        description={
          <>
            Your public pages (<code className="text-[12px]">/o/{me?.organization.slug ?? "…"}</code>) are open to anyone
            with the link by default. Set a password to require it before anyone can view them — visitors enter it once
            per browser.
          </>
        }
      >
        <PublicLockSection />
      </SettingsSection>

      <SettingsSection
        title="API Tokens"
        description={
          <>
            Bearer tokens for non-browser clients (e.g. the MCP server) — a token acts as you, with the same access
            your login has. Keep it as secret as your password; anyone in this browser session can mint or revoke
            tokens, but the token itself only ever works over the API, never to log into the app directly.
          </>
        }
      >
        <ApiTokensSection />
      </SettingsSection>

      <SettingsSection
        title="Organizers"
        description="Everyone here has full, equal access to this organization. Invite a co-organizer by email; they set their own password."
      >
        <OrganizersSection />
      </SettingsSection>

      <SettingsSection title="Account" description="Change your password or email, or delete your account.">
        <AccountSection />
      </SettingsSection>
    </div>
  );
}
