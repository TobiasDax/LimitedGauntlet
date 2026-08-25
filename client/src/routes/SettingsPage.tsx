import { Eyebrow, ScreenDek, ScreenTitle } from "../components/ui";
import { SettingsSection } from "../components/settings/SettingsSection";
import { ApiTokensSection } from "../components/settings/ApiTokensSection";

// Organizer settings hub (PI-26). Organizer-only (this route is inside the
// authed/ProtectedRoute block); the API-token routes it drives are themselves
// session-auth-only, never bearer-auth'd. More sections land here: PI-27
// (public-page password lock) and PI-28 (account: email/password/delete).
export function SettingsPage() {
  return (
    <div>
      <Eyebrow>Your organization</Eyebrow>
      <ScreenTitle>Settings</ScreenTitle>
      <ScreenDek>Manage your organization and account.</ScreenDek>

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
    </div>
  );
}
