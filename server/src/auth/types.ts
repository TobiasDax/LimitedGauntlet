import "fastify";
import "@fastify/secure-session";

declare module "@fastify/secure-session" {
  interface SessionData {
    organizerId?: string;
    authVersion?: number;
    // PI-86 — which org this organizer session is acting in. An account can
    // have several OrganizerMemberships; this picks one. Unset right after
    // login (the middleware resolves it from lastActiveOrgId / the oldest
    // membership and writes it back); set explicitly by POST /auth/switch-org.
    // Cleared when it no longer names a current membership — the session then
    // has to re-pick via the org chooser.
    activeOrgId?: string;
    // Player self-service session (PI-52, split in PI-86). playerIdentityId is
    // the shared PlayerIdentity; playerOrgId is which org's portal this session
    // is in (a player can be a Player row in several orgs). playerAuthVersion
    // is checked against PlayerIdentity.authVersion, same as the organizer side.
    playerIdentityId?: string;
    playerAuthVersion?: number;
    playerOrgId?: string;
    // Org ids whose public-page password lock (PI-27) this visitor has entered.
    publicUnlocked?: string[];
    // In-flight SSO login (PI-42 / PI-43): which provider, plus PKCE/state/nonce
    // stashed between the redirect to the provider and the callback. Cleared
    // once the callback runs. `oidc` is the pre-PI-43 shape, still read for one
    // release so a login in flight across a deploy doesn't break.
    sso?: {
      provider: "oidc" | "google" | "discord";
      state: string;
      nonce: string;
      codeVerifier: string;
      origin: string;
    };
    oidc?: { state: string; nonce: string; codeVerifier: string; origin: string };
    // A verified SSO identity that has no account yet, awaiting the org-setup
    // screen to finish registration (PI-42). Set by the callback, consumed by
    // POST /api/auth/oidc/complete-registration. `subject` is provider-prefixed.
    oidcPending?: { subject: string; email: string; name: string };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    // PI-86 — the logged-in organizer's identity, no org attached. Set by every
    // organizer auth middleware (including for a session with no resolvable
    // active org — that's what lets /auth/me and the org chooser work).
    identity?: {
      id: string;
      email: string;
      name: string;
      // false for an SSO-only account (PI-42) that has never set a local
      // password. Settings → Account and the password-gated routes branch on
      // it — an SSO-only account re-verifies a destructive action with the
      // typed-name confirmation alone.
      hasPassword: boolean;
    };
    // Set by requireAuth / requireSessionAuth (PI-42/PI-86) — the identity PLUS
    // the resolved active org. Absent when the session has no active org (the
    // frontend then routes to the org chooser). Every org-scoped query filters
    // by organizer.orgId — the multi-tenancy boundary.
    organizer?: {
      id: string;
      orgId: string;
      email: string;
      name: string;
      hasPassword: boolean;
    };
    // Set by requirePlayerAuth (PI-52/PI-86) — a logged-in player identity
    // scoped to one org's roster. Every player-scoped query filters by
    // player.orgId.
    player?: {
      id: string; // the Player row id in this org
      identityId: string;
      orgId: string;
      displayName: string;
    };
  }
}
