import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { prisma } from "../prisma.js";
import { computePodStandings } from "./standings.js";

// Outbound webhooks (PI-50): an HMAC-signed HTTP POST fired on round
// lifecycle events so an organizer's own automation (Home Assistant, etc.)
// can react. One-way, fire-and-forget — this app never needs a response
// beyond "did it accept the POST", and a slow/dead receiver must never block
// the round operation that triggered it.

export type WebhookEventType =
  | "round.started"
  | "round.extended"
  | "round.completed"
  | "pairings.posted"
  | "pod.completed"
  | "organization.created"
  | "test";

export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

function signPayload(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

// Deliberately narrow: loopback and link-local only, NOT the broader RFC1918
// ranges. This app's real-world webhook target is typically a self-hoster's
// own Home Assistant (or similar) on their LAN — often a 192.168.x/10.x/
// 172.16-31.x address — so blocking all private ranges would break the
// primary use case. Loopback and link-local have no legitimate reason to be
// a webhook target and are the classic SSRF vectors (hitting the app's own
// interface, or a cloud metadata endpoint like 169.254.169.254).
export function isLoopbackOrLinkLocalAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split(".").map(Number);
    const a = parts[0] ?? 0;
    const b = parts[1] ?? 0;
    if (a === 127 || a === 0) return true; // loopback, "this network"
    if (a === 169 && b === 254) return true; // link-local (includes cloud metadata)
    return false;
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("::ffff:")) return isLoopbackOrLinkLocalAddress(lower.slice("::ffff:".length));
    return false;
  }
  return true; // not a valid IP at all — refuse rather than guess
}

// Best-effort SSRF guard: resolve the target hostname and refuse delivery if
// it points at a loopback/link-local address. Not airtight — the actual HTTP
// request re-resolves DNS itself, so a receiver using DNS rebinding between
// this check and the connection isn't fully closed off. This protects the
// app's own interface and cloud-metadata-style endpoints from an org's
// webhook config; it does NOT restrict LAN targets, which is the expected
// use case (see above).
export async function isSafeWebhookTarget(rawUrl: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const host = url.hostname;
  if (isIP(host)) return !isLoopbackOrLinkLocalAddress(host);

  try {
    const results = await lookup(host, { all: true });
    return results.length > 0 && results.every((r) => !isLoopbackOrLinkLocalAddress(r.address));
  } catch {
    return false;
  }
}

export interface DeliveryResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export async function deliverWebhook(url: string, secret: string, payload: WebhookPayload): Promise<DeliveryResult> {
  const body = JSON.stringify(payload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-LimitedGauntlet-Signature": signPayload(secret, body) },
      body,
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "request_failed" };
  } finally {
    clearTimeout(timeout);
  }
}

// Fired from round/pairing routes alongside their realtime broadcast. Never
// throws — a webhook problem must never fail the request that triggered it.
// `data` is merged under the standard podId/podName/tournamentId/
// tournamentName context every event carries, so callers only need to
// supply what's specific to that event (round number, matches, standings).
// An org can have any number of configured webhooks; each is delivered to
// independently (in parallel) with its own secret, so one slow/broken
// receiver never delays or blocks delivery to the others.
export async function sendWebhookEvent(
  orgId: string,
  podId: string,
  event: WebhookEventType,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const [webhooks, pod] = await Promise.all([
      prisma.organizationWebhook.findMany({ where: { orgId }, select: { id: true, url: true, secret: true } }),
      prisma.pod.findUnique({
        where: { id: podId },
        select: { name: true, webhookEnabled: true, tournamentId: true, tournament: { select: { name: true } } },
      }),
    ]);
    if (webhooks.length === 0) return;
    if (pod && !pod.webhookEnabled) return;

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data: {
        podId,
        podName: pod?.name ?? null,
        tournamentId: pod?.tournamentId ?? null,
        tournamentName: pod?.tournament.name ?? null,
        ...data,
      },
    };

    await Promise.all(
      webhooks.map(async (webhook) => {
        if (!(await isSafeWebhookTarget(webhook.url))) {
          console.warn("Webhook delivery skipped: target resolves to a loopback/link-local address", {
            orgId,
            podId,
            webhookId: webhook.id,
            event,
          });
          return;
        }
        const result = await deliverWebhook(webhook.url, webhook.secret, payload);
        if (!result.ok) {
          console.warn("Webhook delivery failed", { orgId, podId, webhookId: webhook.id, event, ...result });
        }
      }),
    );
  } catch (err) {
    console.error("Webhook dispatch failed", { orgId, podId, event, err });
  }
}

// Runs an async webhook dispatch without blocking the caller and without
// letting a failure surface as an unhandled rejection. The work (building
// the matches/standings payload, then the HTTP POST) all happens after the
// triggering request can already respond — matching "never block a round
// operation," including the DB reads needed to build a richer payload.
export function fireAndForget(work: () => Promise<void>): void {
  void work().catch((err) => console.error("Webhook dispatch failed", err));
}

async function entrantNameMap(podId: string): Promise<Map<string, string>> {
  const entrants = await prisma.entrant.findMany({
    where: { podId },
    select: { id: true, player: { select: { displayName: true } }, team: { select: { name: true } } },
  });
  return new Map(entrants.map((e) => [e.id, e.player?.displayName ?? e.team?.name ?? "—"]));
}

export interface WebhookMatchSummary {
  tableNumber: number;
  entrantA: { id: string; name: string };
  entrantB: { id: string; name: string } | null;
}

// Who's playing whom this round, with resolved display names — so a
// receiver (an HA automation, say) doesn't need to call back into the API
// just to say "Round 3: Alice vs. Bob at table 1".
export async function buildMatchesPayload(podId: string, roundId: string): Promise<WebhookMatchSummary[]> {
  const [names, matches] = await Promise.all([
    entrantNameMap(podId),
    prisma.match.findMany({ where: { roundId }, orderBy: { tableNumber: "asc" } }),
  ]);
  return matches.map((m) => ({
    tableNumber: m.tableNumber,
    entrantA: { id: m.entrantAId, name: names.get(m.entrantAId) ?? "—" },
    entrantB: m.entrantBId ? { id: m.entrantBId, name: names.get(m.entrantBId) ?? "—" } : null,
  }));
}

export interface WebhookStandingsRow {
  rank: number;
  entrant: { id: string; name: string };
  points: number;
  matchWinPct: number;
  gameWinPct: number;
  opponentsMatchWinPct: number;
  opponentsGameWinPct: number;
}

// Current standing for every entrant, ranked — computePodStandings already
// returns rows in rank order, this just attaches display names.
export async function buildStandingsPayload(podId: string): Promise<WebhookStandingsRow[]> {
  const [rows, names] = await Promise.all([computePodStandings(podId), entrantNameMap(podId)]);
  return rows.map((row, index) => ({
    rank: index + 1,
    entrant: { id: row.entrantId, name: names.get(row.entrantId) ?? "—" },
    points: row.points,
    matchWinPct: row.matchWinPct,
    gameWinPct: row.gameWinPct,
    opponentsMatchWinPct: row.opponentsMatchWinPct,
    opponentsGameWinPct: row.opponentsGameWinPct,
  }));
}

// Settings UI "send test event" — unlike sendWebhookEvent, this reports the
// outcome back to the caller so the organizer can tell whether their
// receiver is actually reachable and configured correctly.
export async function sendTestWebhookEvent(
  orgId: string,
  webhookId: string,
): Promise<DeliveryResult & { error?: "not_found" | "unsafe_target" | string }> {
  const webhook = await prisma.organizationWebhook.findFirst({
    where: { id: webhookId, orgId },
    select: { url: true, secret: true },
  });
  if (!webhook) return { ok: false, error: "not_found" };
  if (!(await isSafeWebhookTarget(webhook.url))) return { ok: false, error: "unsafe_target" };

  return deliverWebhook(webhook.url, webhook.secret, {
    event: "test",
    timestamp: new Date().toISOString(),
    data: { message: "This is a test event from LimitedGauntlet." },
  });
}

// PI-75 — a single, deployer-configured, operator-level webhook (env vars,
// not a per-Organization row), fired when a brand-new org signs up on a
// deployment with ALLOW_SIGNUP on. There's no Organization row to hang a
// per-org webhook off of at the moment this fires — the org is what just got
// created — so this is deliberately separate from sendWebhookEvent above,
// even though it reuses the exact same delivery/signing/SSRF-guard pieces.
// Deliberately receiver-agnostic (not Home-Assistant-specific): any
// self-hoster can point ADMIN_WEBHOOK_URL at their own automation platform,
// Discord, ntfy, whatever. Takes the parsed config as a parameter rather
// than importing config.ts directly, to avoid a config.ts <-> webhooks.ts
// circular import (config.ts imports parseAdminWebhookConfig from here).
export interface AdminWebhookConfig {
  url: string;
  secret: string;
}

// Same "pure, throw clearly on malformed config, inert if unset" shape as
// parseTrustedProxies/parseTrackingConfig. Unlike PI-85's TRACKING_SCRIPT_URL
// (a public analytics vendor, https-only), this allows http:// too — same
// allowance settings.ts's per-org webhookUrl schema gives organizers, since
// the real-world target here is just as likely to be a plain-http LAN/
// Tailscale receiver (Home Assistant, etc.) as a public https endpoint.
export function parseAdminWebhookConfig(env: { url?: string; secret?: string }): AdminWebhookConfig | null {
  const urlRaw = env.url?.trim();
  if (!urlRaw) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlRaw);
  } catch {
    throw new Error(`ADMIN_WEBHOOK_URL must be a valid absolute URL (got: "${urlRaw}")`);
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`ADMIN_WEBHOOK_URL must use http:// or https:// (got: "${urlRaw}")`);
  }

  const secret = env.secret?.trim() ?? "";
  if (secret.length < 16) {
    throw new Error("ADMIN_WEBHOOK_SECRET must be set and at least 16 characters long when ADMIN_WEBHOOK_URL is configured");
  }

  return { url: parsedUrl.toString(), secret };
}

// Never throws — a webhook problem must never fail the signup request that
// triggered it, same posture as sendWebhookEvent. Call via fireAndForget from
// the signup route, same as every other webhook trigger point.
export async function sendAdminWebhookEvent(
  webhook: AdminWebhookConfig,
  data: { orgName: string; orgSlug: string; creatorEmail: string },
): Promise<void> {
  try {
    if (!(await isSafeWebhookTarget(webhook.url))) {
      console.warn("Admin webhook delivery skipped: target resolves to a loopback/link-local address");
      return;
    }
    const result = await deliverWebhook(webhook.url, webhook.secret, {
      event: "organization.created",
      timestamp: new Date().toISOString(),
      data,
    });
    if (!result.ok) {
      console.warn("Admin webhook delivery failed", result);
    }
  } catch (err) {
    console.error("Admin webhook dispatch failed", err);
  }
}
