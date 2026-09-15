import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
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

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

// Injectable so tests can simulate a rebinding/mixed-answer resolver without
// controlling real DNS — see webhooks.test.ts. Production always uses the
// default (real dns.lookup).
export type DnsLookupFn = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const realDnsLookup: DnsLookupFn = (hostname) => dnsLookup(hostname, { all: true });

// PI-113 — the ONE DNS resolution performed for a delivery attempt. Every
// resolved address must be safe (a hostname mixing a safe and an unsafe
// address is refused outright, not partially trusted) — but critically, the
// single address this returns is also the exact address deliverWebhook pins
// the actual TCP/TLS connection to below, via a custom `lookup`. That's what
// closes the DNS-rebinding gap the old isSafeWebhookTarget()-then-fetch()
// sequence had: there is no second, independent resolution for an attacker's
// authoritative nameserver to answer differently on.
export async function resolveSafeAddress(
  host: string,
  lookupFn: DnsLookupFn = realDnsLookup,
): Promise<ResolvedAddress | null> {
  const ipVersion = isIP(host);
  if (ipVersion) {
    return isLoopbackOrLinkLocalAddress(host) ? null : { address: host, family: ipVersion as 4 | 6 };
  }

  let results: Array<{ address: string; family: number }>;
  try {
    results = await lookupFn(host);
  } catch {
    return null;
  }
  if (results.length === 0 || results.some((r) => isLoopbackOrLinkLocalAddress(r.address))) return null;

  // Which of the (all-safe) answers gets pinned is arbitrary, same "which
  // one is arbitrary" precedent as computeSeatings elsewhere in this app —
  // prefer IPv4 only for deterministic test/log output on a dual-stack answer.
  const chosen = results.find((r) => r.family === 4) ?? results[0]!;
  return { address: chosen.address, family: chosen.family as 4 | 6 };
}

export interface DeliveryResult {
  ok: boolean;
  status?: number;
  error?: string;
}

// PI-113 — pins the actual socket to the address resolveSafeAddress already
// validated, via Node's `lookup` connection option: the hostname stays
// `url.hostname` everywhere else (Host header, TLS SNI, certificate
// hostname validation all key off it normally), only the low-level
// address-for-this-hostname resolution is intercepted, so a legitimate TLS
// cert for the real hostname still validates correctly against a
// loopback-avoiding, otherwise-arbitrary pinned IP.
//
// This also closes the redirect-pivot gap for free: unlike fetch(), Node's
// core http/https clients never auto-follow redirects — a 3xx response
// simply comes back as this address's actual response (falling out of the
// existing `ok: status in 200-299` check below as a failed delivery), with
// no second, unvalidated connection ever made.
function pinnedLookup(resolved: ResolvedAddress): http.RequestOptions["lookup"] {
  return (_hostname, _options, callback) => {
    callback(null, [{ address: resolved.address, family: resolved.family }]);
  };
}

function requestOnce(
  url: URL,
  resolved: ResolvedAddress,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<{ status: number }> {
  return new Promise((resolvePromise, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers,
        lookup: pinnedLookup(resolved),
        // Explicit belt-and-suspenders alongside `hostname` above: forces
        // the right TLS SNI/cert-hostname target regardless of Node version
        // quirks in how `lookup` interacts with servername defaulting.
        ...(url.protocol === "https:" ? { servername: url.hostname } : {}),
        timeout: timeoutMs,
      },
      (res) => {
        res.resume(); // drain the body — no delivery caller reads it, and an
        // unconsumed response keeps the socket (and this promise) open.
        res.on("end", () => resolvePromise({ status: res.statusCode ?? 0 }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
    req.end(body);
  });
}

export async function deliverWebhook(
  url: string,
  secret: string,
  payload: WebhookPayload,
  overrides?: { lookup?: DnsLookupFn },
): Promise<DeliveryResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "unsafe_target" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false, error: "unsafe_target" };

  const resolved = await resolveSafeAddress(parsed.hostname, overrides?.lookup);
  if (!resolved) return { ok: false, error: "unsafe_target" };

  const body = JSON.stringify(payload);
  const headers = { "Content-Type": "application/json", "X-LimitedGauntlet-Signature": signPayload(secret, body) };

  try {
    const { status } = await requestOnce(parsed, resolved, headers, body, 5_000);
    return { ok: status >= 200 && status < 300, status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "request_failed" };
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
  // `error`, when set: "not_found" | "unsafe_target" | a delivery error string.
): Promise<DeliveryResult> {
  const webhook = await prisma.organizationWebhook.findFirst({
    where: { id: webhookId, orgId },
    select: { url: true, secret: true },
  });
  if (!webhook) return { ok: false, error: "not_found" };

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
    throw new Error(
      "ADMIN_WEBHOOK_SECRET must be set and at least 16 characters long when ADMIN_WEBHOOK_URL is configured",
    );
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
