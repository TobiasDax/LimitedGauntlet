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
};
