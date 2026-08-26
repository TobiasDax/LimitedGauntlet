import { Issuer, generators, type Client, type TokenSet } from "openid-client";
import { config, isOidcConfigured } from "../config.js";
import { resolveBaseUrl } from "./mailer.js";

// Optional OIDC / SSO login (PI-42). One provider per deployment, env-
// configured; the whole feature is inert unless issuer + client id/secret are
// set (see isOidcConfigured). The discovered client is memoized — discovery is
// a network round-trip we only want to make once.

export const OIDC_CALLBACK_PATH = "/api/auth/oidc/callback";

let clientPromise: Promise<Client> | null = null;

async function getClient(): Promise<Client> {
  if (!isOidcConfigured()) throw new Error("oidc_not_configured");
  if (!clientPromise) {
    clientPromise = (async () => {
      const issuer = await Issuer.discover(config.oidc.issuer);
      return new issuer.Client({
        client_id: config.oidc.clientId,
        client_secret: config.oidc.clientSecret,
        response_types: ["code"],
      });
    })().catch((err) => {
      // Don't cache a failed discovery — let the next attempt retry (the IdP
      // may just have been briefly unreachable at boot).
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

// The redirect URI must be an absolute URL the IdP will call back. Prefer an
// explicit OIDC_REDIRECT_URI; otherwise derive it from APP_BASE_URL (or, as a
// last resort, the current request's origin) plus the callback path.
export function resolveRedirectUri(requestOrigin: string): string {
  if (config.oidc.redirectUri) return config.oidc.redirectUri;
  return `${resolveBaseUrl(requestOrigin)}${OIDC_CALLBACK_PATH}`;
}

export interface OidcAuthStart {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

// Build the authorization-endpoint URL to redirect the browser to, along with
// the PKCE/state/nonce values the callback must check against (stashed in the
// caller's session).
export async function beginOidcLogin(requestOrigin: string): Promise<OidcAuthStart> {
  const client = await getClient();
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);
  const state = generators.state();
  const nonce = generators.nonce();
  const url = client.authorizationUrl({
    scope: config.oidc.scope,
    redirect_uri: resolveRedirectUri(requestOrigin),
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });
  return { url, state, nonce, codeVerifier };
}

export interface OidcIdentity {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

// Complete the callback: exchange the code and validate the id_token against
// the expected state/nonce/PKCE verifier, then extract the identity claims.
export async function completeOidcLogin(
  requestOrigin: string,
  callbackParams: Record<string, string>,
  checks: { state: string; nonce: string; codeVerifier: string },
): Promise<OidcIdentity> {
  const client = await getClient();
  const tokenSet: TokenSet = await client.callback(resolveRedirectUri(requestOrigin), callbackParams, {
    state: checks.state,
    nonce: checks.nonce,
    code_verifier: checks.codeVerifier,
  });
  const claims = tokenSet.claims();
  return {
    subject: claims.sub,
    email: typeof claims.email === "string" ? claims.email.toLowerCase() : null,
    // Treat the claim as truthy only when the IdP explicitly asserts it.
    emailVerified: claims.email_verified === true,
    name: typeof claims.name === "string" ? claims.name : null,
  };
}
