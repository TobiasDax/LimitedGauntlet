import "fastify";
import "@fastify/secure-session";

declare module "@fastify/secure-session" {
  interface SessionData {
    organizerId?: string;
    authVersion?: number;
    // Player self-service session (PI-52). Independent of organizerId — the two
    // can coexist in one cookie, and each middleware only looks at its own
    // keys. playerAuthVersion is checked against Player.authVersion the same
    // way authVersion is checked against OrganizerAccount.authVersion.
    playerId?: string;
    playerAuthVersion?: number;
    // Org ids whose public-page password lock (PI-27) this visitor has entered.
    publicUnlocked?: string[];
    // In-flight OIDC login (PI-42): PKCE/state/nonce stashed between the
    // redirect to the IdP and the callback. Cleared once the callback runs.
    oidc?: { state: string; nonce: string; codeVerifier: string; origin: string };
    // A verified OIDC identity that has no account yet, awaiting the org-setup
    // screen to finish registration (PI-42). Set by the callback, consumed by
    // POST /api/auth/oidc/complete-registration.
    oidcPending?: { subject: string; email: string; name: string };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    organizer?: {
      id: string;
      orgId: string;
      email: string;
      name: string;
    };
    // Set by requirePlayerAuth (PI-52) — a logged-in roster player, scoped to
    // their own org. Every player-scoped query must filter by player.orgId,
    // same multi-tenancy rule as request.organizer.
    player?: {
      id: string;
      orgId: string;
      displayName: string;
    };
  }
}
