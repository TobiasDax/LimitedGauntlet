import { Issuer, generators, type Client, type TokenSet } from "openid-client";
import { config, type SsoProviderId } from "../config.js";
import { prisma } from "../prisma.js";
import { isEmailConfigured, resolveBaseUrl, sendMail } from "./mailer.js";
import { createOidcRelinkRequest } from "./oidcRelink.js";

// SSO / social login (PI-42 + PI-43). Up to three providers, each independently
// optional (config.ts's configuredSsoProviders decides which buttons show):
//   - `oidc`   — a generic OpenID Connect provider (OIDC_ISSUER, e.g. Pocket ID)
//   - `google` — standards OIDC at the fixed Google issuer
//   - `discord`— plain OAuth2: Discord issues no id_token, so identity comes
//                from GET /users/@me with the access token
// All three feed the same account-linking logic in routes/auth.ts, keyed on a
// provider-prefixed subject (`google:123`, `discord:456`, `oidc:<sub>`).

// The generic-OIDC callback keeps its historical path so an already-registered
// redirect URI (Pocket ID) needs no change; google/discord use /sso/<id>/callback.
export const OIDC_CALLBACK_PATH = "/api/auth/oidc/callback";

export function ssoCallbackPath(provider: SsoProviderId): string {
  return provider === "oidc" ? OIDC_CALLBACK_PATH : `/api/auth/sso/${provider}/callback`;
}

export function resolveRedirectUri(provider: SsoProviderId, requestOrigin: string): string {
  if (provider === "oidc" && config.oidc.redirectUri) return config.oidc.redirectUri;
  return `${resolveBaseUrl(requestOrigin)}${ssoCallbackPath(provider)}`;
}

export interface SsoIdentity {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface SsoAuthStart {
  url: string;
  state: string;
  nonce: string; // "" for discord (no id_token / nonce)
  codeVerifier: string;
}

export interface SsoChecks {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export function isProviderConfigured(provider: SsoProviderId): boolean {
  if (provider === "oidc") {
    return !!(config.oidc.issuer && config.oidc.clientId && config.oidc.clientSecret);
  }
  const cfg = provider === "google" ? config.google : config.discord;
  return !!(cfg.clientId && cfg.clientSecret);
}

// --- openid-client providers (oidc, google) -------------------------------

interface OidcProviderConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  scope: string;
}

function oidcConfigFor(provider: "oidc" | "google"): OidcProviderConfig {
  if (provider === "google") {
    return {
      issuer: "https://accounts.google.com",
      clientId: config.google.clientId,
      clientSecret: config.google.clientSecret,
      scope: "openid email profile",
    };
  }
  return {
    issuer: config.oidc.issuer,
    clientId: config.oidc.clientId,
    clientSecret: config.oidc.clientSecret,
    scope: config.oidc.scope,
  };
}

// Discovered clients are memoized per provider — discovery is a network
// round-trip we only want to make once. A failed discovery is not cached.
const clientPromises = new Map<string, Promise<Client>>();

async function getOidcClient(provider: "oidc" | "google"): Promise<Client> {
  const cfg = oidcConfigFor(provider);
  let promise = clientPromises.get(provider);
  if (!promise) {
    promise = (async () => {
      const issuer = await Issuer.discover(cfg.issuer);
      return new issuer.Client({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        response_types: ["code"],
      });
    })().catch((err) => {
      clientPromises.delete(provider);
      throw err;
    });
    clientPromises.set(provider, promise);
  }
  return promise;
}

async function oidcBegin(provider: "oidc" | "google", redirectUri: string): Promise<SsoAuthStart> {
  const client = await getOidcClient(provider);
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);
  const state = generators.state();
  const nonce = generators.nonce();
  const url = client.authorizationUrl({
    scope: oidcConfigFor(provider).scope,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });
  return { url, state, nonce, codeVerifier };
}

async function oidcComplete(
  provider: "oidc" | "google",
  redirectUri: string,
  params: Record<string, string>,
  checks: SsoChecks,
): Promise<SsoIdentity> {
  const client = await getOidcClient(provider);
  const tokenSet: TokenSet = await client.callback(redirectUri, params, {
    state: checks.state,
    nonce: checks.nonce,
    code_verifier: checks.codeVerifier,
  });
  const claims = tokenSet.claims();
  return {
    subject: claims.sub,
    email: typeof claims.email === "string" ? claims.email.toLowerCase() : null,
    emailVerified: claims.email_verified === true,
    name: typeof claims.name === "string" ? claims.name : null,
  };
}

// --- Discord (plain OAuth2, no id_token) ----------------------------------

const DISCORD_AUTHORIZE = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN = "https://discord.com/api/oauth2/token";
const DISCORD_USER = "https://discord.com/api/users/@me";

async function discordBegin(redirectUri: string): Promise<SsoAuthStart> {
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);
  const state = generators.state();
  const url =
    `${DISCORD_AUTHORIZE}?` +
    new URLSearchParams({
      client_id: config.discord.clientId,
      response_type: "code",
      scope: "identify email",
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    }).toString();
  return { url, state, nonce: "", codeVerifier };
}

// Extracts a normalized identity from Discord's /users/@me response. Exported
// for unit testing without a live OAuth round-trip.
export function parseDiscordUser(raw: unknown): SsoIdentity {
  const user = (raw ?? {}) as {
    id?: string;
    username?: string;
    global_name?: string | null;
    email?: string | null;
    verified?: boolean;
  };
  if (!user.id) throw new Error("sso_userinfo_failed");
  const email = typeof user.email === "string" ? user.email.toLowerCase() : null;
  return {
    subject: user.id,
    email,
    // Discord only counts as a verified email when it says so AND gave us one.
    emailVerified: user.verified === true && email !== null,
    name: user.global_name || user.username || null,
  };
}

async function discordComplete(
  redirectUri: string,
  params: Record<string, string>,
  checks: SsoChecks,
): Promise<SsoIdentity> {
  if (!params.code || !params.state || params.state !== checks.state) {
    throw new Error("sso_state_mismatch");
  }
  const tokenRes = await fetch(DISCORD_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.discord.clientId,
      client_secret: config.discord.clientSecret,
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: redirectUri,
      code_verifier: checks.codeVerifier,
    }).toString(),
  });
  if (!tokenRes.ok) throw new Error("sso_token_exchange_failed");
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("sso_token_exchange_failed");

  const userRes = await fetch(DISCORD_USER, { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!userRes.ok) throw new Error("sso_userinfo_failed");
  return parseDiscordUser(await userRes.json());
}

// --- public entry points -------------------------------------------------

export async function beginSso(provider: SsoProviderId, requestOrigin: string): Promise<SsoAuthStart> {
  if (!isProviderConfigured(provider)) throw new Error("sso_provider_not_configured");
  const redirectUri = resolveRedirectUri(provider, requestOrigin);
  return provider === "discord" ? discordBegin(redirectUri) : oidcBegin(provider, redirectUri);
}

export async function completeSso(
  provider: SsoProviderId,
  requestOrigin: string,
  params: Record<string, string>,
  checks: SsoChecks,
): Promise<SsoIdentity> {
  if (!isProviderConfigured(provider)) throw new Error("sso_provider_not_configured");
  const redirectUri = resolveRedirectUri(provider, requestOrigin);
  return provider === "discord"
    ? discordComplete(redirectUri, params, checks)
    : oidcComplete(provider, redirectUri, params, checks);
}

// --- account linking (PI-42 / PI-43) -------------------------------------

// Map a verified external identity to an organizer account. The subject is
// provider-prefixed (`google:123`) so two providers can't collide and "one SSO
// identity per account" is enforced naturally. Paths, in order:
//   1. Known prefixed subject → the account we linked before.
//   2. Verified email matching an existing account → link (record the subject).
//   3. Verified email matching a pending co-organizer invite → provision a
//      passwordless account into that org and consume the invite.
//   4. Unknown identity + signups open → "needs_registration": the caller sends
//      them to the org-setup screen to create a brand-new org via SSO.
//   5. Unknown identity + signups closed → refused; an organizer must invite
//      this email first.
export type SsoLinkResult =
  | { status: "ok"; organizerId: string; authVersion: number }
  | { status: "recovery_required"; emailSent: boolean }
  | { status: "needs_registration"; subject: string; email: string; name: string }
  | { status: "error"; error: string };

export async function linkOrProvisionFromSso(
  provider: SsoProviderId,
  identity: SsoIdentity,
  origin: string,
): Promise<SsoLinkResult> {
  const subject = `${provider}:${identity.subject}`;

  const bySubject = await prisma.organizerAccount.findUnique({ where: { oidcSubject: subject } });
  if (bySubject) return { status: "ok", organizerId: bySubject.id, authVersion: bySubject.authVersion };

  if (!identity.email || !identity.emailVerified) {
    return { status: "error", error: "oidc_email_unverified" };
  }

  const byEmail = await prisma.organizerAccount.findUnique({ where: { email: identity.email } });
  if (byEmail) {
    // Link the subject to the existing account if it isn't already, so future
    // logins match on the stable subject even if the provider email changes.
    if (!byEmail.oidcSubject) {
      const linked = await prisma.organizerAccount.updateMany({
        where: { id: byEmail.id, oidcSubject: null },
        data: { oidcSubject: subject },
      });
      if (linked.count === 1) return { status: "ok", organizerId: byEmail.id, authVersion: byEmail.authVersion };
    } else if (byEmail.oidcSubject === subject) {
      return { status: "ok", organizerId: byEmail.id, authVersion: byEmail.authVersion };
    }
    // Account already bound to a different SSO identity (another provider, or the
    // same provider's subject changed) — never a silent rebind; go through the
    // PI-49 mailbox/operator relink.
    const { request: relink, token } = await createOidcRelinkRequest(byEmail.id, subject, byEmail.email);
    const emailSent = isEmailConfigured();
    if (emailSent) {
      const url = `${resolveBaseUrl(origin)}/oidc-relink?token=${encodeURIComponent(token)}`;
      await sendMail({
        to: byEmail.email,
        subject: "Confirm your LimitedGauntlet SSO relink",
        text: `Confirm this SSO account relink within one hour: ${url}`,
      });
    }
    console.warn("SSO subject relink required", { organizerId: byEmail.id, requestId: relink.id, emailSent });
    return { status: "recovery_required", emailSent };
  }

  const invite = await prisma.organizerInvite.findFirst({
    where: { email: identity.email, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (invite) {
    const [organizer] = await prisma.$transaction([
      prisma.organizerAccount.create({
        data: {
          orgId: invite.orgId,
          email: identity.email,
          name: identity.name || identity.email,
          passwordHash: null,
          oidcSubject: subject,
        },
      }),
      prisma.organizerInvite.update({ where: { id: invite.id }, data: { usedAt: new Date() } }),
    ]);
    return { status: "ok", organizerId: organizer.id, authVersion: organizer.authVersion };
  }

  if (config.allowSignup) {
    return { status: "needs_registration", subject, email: identity.email, name: identity.name ?? "" };
  }
  return { status: "error", error: "oidc_no_account" };
}
