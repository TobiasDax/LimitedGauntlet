import { randomUUID } from "node:crypto";

// Two-step confirm for destructive tools (per PLAN.md/STEPS.md's PI-4
// decision): the first call is a dry run that describes what would be
// affected and hands back a confirmation token; nothing mutates until a
// second call passes that token, or the caller explicitly passes
// confirm: true to skip straight to executing. Tokens live only in this
// process's memory (the MCP server is a single long-running local
// process per pod, one instance per client) and expire after 5 minutes
// so a stale confirmation can't fire hours later against changed state.
interface PendingConfirmation {
  description: string;
  expiresAt: number;
  execute: () => Promise<unknown>;
}

const pending = new Map<string, PendingConfirmation>();
const TTL_MS = 5 * 60_000;

export function registerConfirmation(description: string, execute: () => Promise<unknown>): string {
  const token = randomUUID();
  pending.set(token, { description, expiresAt: Date.now() + TTL_MS, execute });
  return token;
}

export type ConfirmationOutcome = { ok: true; result: unknown } | { ok: false; error: string };

export async function runConfirmation(token: string): Promise<ConfirmationOutcome> {
  const entry = pending.get(token);
  pending.delete(token);
  if (!entry) {
    return {
      ok: false,
      error: "Unknown or already-used confirmation token. Call the tool again without it to get a fresh one.",
    };
  }
  if (Date.now() > entry.expiresAt) {
    return { ok: false, error: "Confirmation token expired (5 minute limit). Call the tool again to get a fresh one." };
  }
  const result = await entry.execute();
  return { ok: true, result };
}
