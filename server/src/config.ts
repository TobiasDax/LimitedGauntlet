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
};

export function isEmailConfigured(): boolean {
  return config.smtp.host.length > 0 && config.smtp.from.length > 0;
}

export function isOidcConfigured(): boolean {
  return (
    config.oidc.issuer.length > 0 && config.oidc.clientId.length > 0 && config.oidc.clientSecret.length > 0
  );
}
