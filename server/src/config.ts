function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseSessionKey(hex: string): Buffer {
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(
      `SESSION_SECRET must decode to exactly 32 bytes (got ${key.length}). Generate one with: openssl rand -hex 32`,
    );
  }
  return key;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? "0.0.0.0",
  // Exact proxy peers/CIDRs allowed to supply forwarding headers. Blank means
  // direct-client mode: X-Forwarded-* is ignored for request identity.
  trustedProxies: parseTrustedProxies(process.env.TRUSTED_PROXIES),
  sessionKey: parseSessionKey(requireEnv("SESSION_SECRET")),
  // Off by default so a fresh `docker compose up` over plain HTTP (LAN,
  // first local test, etc.) doesn't silently break login by dropping the
  // session cookie. Flip to true once a TLS-terminating reverse proxy is
  // in front — see README for deployment notes.
  sessionCookieSecure: process.env.SESSION_COOKIE_SECURE === "true",
  // Off by default — this app is meant to be shared with an existing group,
  // not a public signup form. Flip to "true" only while someone actually
  // needs to create an account, then flip it back. GET /api/auth/signup
  // exposes this so the frontend can show a clear "closed" message instead
  // of a dead-end form.
  allowSignup: process.env.ALLOW_SIGNUP === "true",
  // Base URL the app is reached at (e.g. https://gauntlet.example.com), used to
  // build absolute links in emails. Falls back to the request origin when empty.
  appBaseUrl: process.env.APP_BASE_URL ?? "",
  // Optional SMTP for transactional email (PI-29) — email-change verification
  // (PI-28). Entirely optional: if SMTP_HOST is unset, email features are
  // disabled and degrade with a clear error rather than crashing the app.
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "",
    // STARTTLS (587) vs implicit TLS (465). Default false = STARTTLS.
    secure: process.env.SMTP_SECURE === "true",
  },
  // Optional footer legal link (PI-35) — a deployer can point this at their
  // own hosted Impressum/Privacy Policy/etc. Blank by default: this is
  // self-hosted OSS, so there's no built-in legal content to ship, and the
  // footer simply omits the link when unset.
  legalLinkUrl: process.env.LEGAL_LINK_URL ?? "",
  legalLinkLabel: process.env.LEGAL_LINK_LABEL ?? "",
  // Optional OIDC / SSO login (PI-42). One identity provider per deployment.
  // Entirely optional: if issuer/clientId/clientSecret aren't all set,
  // isOidcConfigured() is false and the app runs password-only (the "Sign in
  // with…" button just isn't shown). redirectUri falls back to
  // APP_BASE_URL + the callback path when not given explicitly.
  oidc: {
    issuer: process.env.OIDC_ISSUER ?? "",
    clientId: process.env.OIDC_CLIENT_ID ?? "",
    clientSecret: process.env.OIDC_CLIENT_SECRET ?? "",
    redirectUri: process.env.OIDC_REDIRECT_URI ?? "",
    // Label for the login button ("Sign in with <name>").
    providerName: process.env.OIDC_PROVIDER_NAME ?? "SSO",
    // Space-separated scopes; must include openid + email for account linking.
    scope: process.env.OIDC_SCOPE ?? "openid email profile",
  },
  // Social login (PI-43), layered on the same PI-42 account-linking machinery.
  // Each is independently optional — set both id + secret to offer that button.
  // Google is standards OIDC (fixed issuer); Discord is plain OAuth2 (no
  // id_token — identity comes from its /users/@me endpoint).
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  },
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID ?? "",
    clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
  },
  // Switch the whole deployment to SSO-only (PI-42): disable local password
  // login + local signup so OIDC is the only way in. Only honoured when OIDC is
  // actually configured (see isLocalLoginDisabled) — a fail-safe so setting
  // this without a working IdP can't lock everyone out of the app.
  localLoginDisabled: process.env.LOCAL_LOGIN_DISABLED === "true",
  // Optional deployer-configured web analytics (PI-85), Umami first. Unset
  // TRACKING_PROVIDER = fully inert, same "off by default" posture as
  // everything else here. See trackingProviders.ts for validation + the
  // provider registry; index.ts adds the script host to CSP when this is set.
  tracking: parseTrackingConfig({
    provider: process.env.TRACKING_PROVIDER,
    scriptUrl: process.env.TRACKING_SCRIPT_URL,
    code: process.env.TRACKING_CODE,
  }),
  // Optional operator-level webhook (PI-75), fired on a new org signup.
  // Unset ADMIN_WEBHOOK_URL = fully inert, same "off by default" posture as
  // everything else here. Deliberately separate from the per-org webhooks
  // (Settings, PI-50): there's no Organization row yet at the moment this
  // fires. See services/webhooks.ts for validation + delivery.
  adminWebhook: parseAdminWebhookConfig({
    url: process.env.ADMIN_WEBHOOK_URL,
    secret: process.env.ADMIN_WEBHOOK_SECRET,
  }),
};

export function isEmailConfigured(): boolean {
  return config.smtp.host.length > 0 && config.smtp.from.length > 0;
}

export function isOidcConfigured(): boolean {
  return (
    config.oidc.issuer.length > 0 && config.oidc.clientId.length > 0 && config.oidc.clientSecret.length > 0
  );
}

export type SsoProviderId = "oidc" | "google" | "discord";

// Which SSO buttons to show, in the order they render. A provider appears only
// when its credentials are set — same "degrades to password-only" posture as
// SMTP. `oidc` uses the operator-chosen label; the social ones are fixed.
export function configuredSsoProviders(): Array<{ id: SsoProviderId; label: string }> {
  const providers: Array<{ id: SsoProviderId; label: string }> = [];
  if (isOidcConfigured()) providers.push({ id: "oidc", label: config.oidc.providerName || "SSO" });
  if (config.google.clientId && config.google.clientSecret) providers.push({ id: "google", label: "Google" });
  if (config.discord.clientId && config.discord.clientSecret) providers.push({ id: "discord", label: "Discord" });
  return providers;
}

export function isSsoConfigured(): boolean {
  return configuredSsoProviders().length > 0;
}

// SSO-only mode is only in effect when at least one SSO provider is actually
// usable — otherwise the flag is ignored so a misconfiguration can't leave the
// app with no way to log in at all.
export function isLocalLoginDisabled(): boolean {
  return config.localLoginDisabled && isSsoConfigured();
}
import { parseTrustedProxies } from "./proxyTrust.js";
import { parseTrackingConfig } from "./trackingProviders.js";
import { parseAdminWebhookConfig } from "./services/webhooks.js";
