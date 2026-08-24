import { randomBytes, createHash } from "node:crypto";

// Tokens are high-entropy random secrets, not user-chosen passwords, so a
// fast SHA-256 lookup hash is the right tool here — argon2 (used for login
// passwords, which are low-entropy and need to resist offline guessing) is
// unnecessary and would make every bearer request slower for no benefit.
const TOKEN_PREFIX = "lg_";

export function generateApiToken(): { plaintext: string; hash: string } {
  const secret = randomBytes(32).toString("base64url");
  const plaintext = `${TOKEN_PREFIX}${secret}`;
  return { plaintext, hash: hashApiToken(plaintext) };
}

export function hashApiToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}
