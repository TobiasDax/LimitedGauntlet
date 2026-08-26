import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { networkInterfaces } from "node:os";
import { createHmac } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  buildMatchesPayload,
  buildStandingsPayload,
  deliverWebhook,
  isLoopbackOrLinkLocalAddress,
  isSafeWebhookTarget,
  sendTestWebhookEvent,
  sendWebhookEvent,
} from "./webhooks.js";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

// The SSRF guard allows LAN targets (the real-world use case — Home
// Assistant on a self-hoster's own network) and only blocks loopback/link-
// local. That means a test HTTP server needs a non-loopback address to
// exercise the "delivery actually happens" path — the container's own
// assigned interface IP (e.g. a Docker bridge address) is exactly that: a
// private, non-loopback, non-link-local address, same shape as a real LAN
// target.
function ownNonLoopbackAddress(): string {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  throw new Error("no non-loopback IPv4 interface found — can't run this test here");
}

async function withTestServer(
  handler: (req: IncomingMessage, body: string) => { status: number; body?: string },
): Promise<{ url: string; close: () => Promise<void>; requests: { headers: Record<string, string | string[] | undefined>; body: string }[] }> {
  const requests: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      requests.push({ headers: req.headers, body });
      const result = handler(req, body);
      res.writeHead(result.status, { "Content-Type": "application/json" });
      res.end(result.body ?? "{}");
    });
  });
  const host = ownNonLoopbackAddress();
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://${host}:${port}/hook`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    requests,
  };
}

describe("isLoopbackOrLinkLocalAddress", () => {
  it("flags loopback and link-local addresses", () => {
    expect(isLoopbackOrLinkLocalAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackOrLinkLocalAddress("0.0.0.0")).toBe(true);
    expect(isLoopbackOrLinkLocalAddress("169.254.169.254")).toBe(true); // cloud metadata
    expect(isLoopbackOrLinkLocalAddress("::1")).toBe(true);
    expect(isLoopbackOrLinkLocalAddress("fe80::1")).toBe(true);
    expect(isLoopbackOrLinkLocalAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackOrLinkLocalAddress("not-an-ip")).toBe(true); // refuse rather than guess
  });

  it("does NOT flag private LAN addresses — the real-world webhook target", () => {
    expect(isLoopbackOrLinkLocalAddress("192.168.1.231")).toBe(false);
    expect(isLoopbackOrLinkLocalAddress("10.0.0.5")).toBe(false);
    expect(isLoopbackOrLinkLocalAddress("172.20.0.2")).toBe(false);
    expect(isLoopbackOrLinkLocalAddress("8.8.8.8")).toBe(false);
    expect(isLoopbackOrLinkLocalAddress("fc00::1")).toBe(false);
  });
});

describe("isSafeWebhookTarget", () => {
  it("rejects non-http(s) protocols and malformed URLs", async () => {
    await expect(isSafeWebhookTarget("ftp://example.com/hook")).resolves.toBe(false);
    await expect(isSafeWebhookTarget("not a url")).resolves.toBe(false);
  });

  it("rejects an IP-literal loopback/link-local target", async () => {
    await expect(isSafeWebhookTarget("http://127.0.0.1:9999/hook")).resolves.toBe(false);
    await expect(isSafeWebhookTarget("http://169.254.169.254/hook")).resolves.toBe(false);
  });

  it("accepts an IP-literal LAN target", async () => {
    await expect(isSafeWebhookTarget(`http://${ownNonLoopbackAddress()}:9999/hook`)).resolves.toBe(true);
  });

  it("resolves a hostname and rejects it if it resolves to loopback", async () => {
    await expect(isSafeWebhookTarget("http://localhost:9999/hook")).resolves.toBe(false);
  });
});

describe("deliverWebhook", () => {
  it("sends a correctly HMAC-signed POST and reports the response status", async () => {
    const server = await withTestServer(() => ({ status: 200 }));
    try {
      const payload = { event: "test" as const, timestamp: "2026-01-01T00:00:00.000Z", data: { hello: "world" } };
      const result = await deliverWebhook(server.url, "my-secret", payload);
      expect(result).toEqual({ ok: true, status: 200 });

      expect(server.requests).toHaveLength(1);
      const [received] = server.requests;
      expect(received!.headers["content-type"]).toBe("application/json");
      const expectedSignature = `sha256=${createHmac("sha256", "my-secret").update(received!.body).digest("hex")}`;
      expect(received!.headers["x-limitedgauntlet-signature"]).toBe(expectedSignature);
      expect(JSON.parse(received!.body)).toEqual(payload);
    } finally {
      await server.close();
    }
  });

  it("reports a non-2xx response as not ok, without throwing", async () => {
    const server = await withTestServer(() => ({ status: 500 }));
    try {
      const result = await deliverWebhook(server.url, "secret", { event: "test", timestamp: "now", data: {} });
      expect(result).toEqual({ ok: false, status: 500 });
    } finally {
      await server.close();
    }
  });

  it("reports a connection failure as not ok, without throwing", async () => {
    // Nothing is listening on this port.
    const result = await deliverWebhook(`http://${ownNonLoopbackAddress()}:1/hook`, "secret", {
      event: "test",
      timestamp: "now",
      data: {},
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("sendWebhookEvent", () => {
  async function makeOrgTournamentPod(webhooks: { url: string; secret: string; label?: string }[] = [], webhookEnabled = true) {
    const unique = `${Date.now()}-${Math.random()}`;
    const org = await prisma.organization.create({
      data: {
        slug: `webhook-${unique}`,
        name: "Webhook Test Org",
        webhooks: { create: webhooks.map((w) => ({ url: w.url, secret: w.secret, label: w.label ?? null })) },
      },
    });
    const tournament = await prisma.tournament.create({
      data: { orgId: org.id, name: "Webhook Test Tournament", startDate: new Date(), endDate: new Date() },
    });
    const pod = await prisma.pod.create({
      data: { tournamentId: tournament.id, name: "Webhook Test Pod", format: "DRAFT", sequenceOrder: 0, webhookEnabled },
    });
    return { org, tournament, pod };
  }

  it("does nothing when the org has no webhook configured", async () => {
    const { org, pod } = await makeOrgTournamentPod();
    await expect(sendWebhookEvent(org.id, pod.id, "round.started", {})).resolves.toBeUndefined();
  });

  it("does nothing when the pod has opted out", async () => {
    const server = await withTestServer(() => ({ status: 200 }));
    try {
      const { org, pod } = await makeOrgTournamentPod([{ url: server.url, secret: "s" }], false);
      await sendWebhookEvent(org.id, pod.id, "round.started", {});
      expect(server.requests).toHaveLength(0);
    } finally {
      await server.close();
    }
  });

  it("skips delivery when the configured URL is loopback/link-local", async () => {
    const { org, pod } = await makeOrgTournamentPod([{ url: "http://127.0.0.1:9999/hook", secret: "s" }]);
    await expect(sendWebhookEvent(org.id, pod.id, "round.started", {})).resolves.toBeUndefined();
  });

  it("delivers with the standard context merged under the event-specific data", async () => {
    const server = await withTestServer(() => ({ status: 200 }));
    try {
      const { org, tournament, pod } = await makeOrgTournamentPod([{ url: server.url, secret: "s" }]);
      await sendWebhookEvent(org.id, pod.id, "round.started", { roundId: "r1", roundNumber: 2 });

      expect(server.requests).toHaveLength(1);
      const body = JSON.parse(server.requests[0]!.body);
      expect(body).toMatchObject({
        event: "round.started",
        data: {
          podId: pod.id,
          podName: "Webhook Test Pod",
          tournamentId: tournament.id,
          tournamentName: "Webhook Test Tournament",
          roundId: "r1",
          roundNumber: 2,
        },
      });
      expect(typeof body.timestamp).toBe("string");
    } finally {
      await server.close();
    }
  });

  it("delivers the same event to multiple configured webhooks, each with its own signature", async () => {
    const serverA = await withTestServer(() => ({ status: 200 }));
    const serverB = await withTestServer(() => ({ status: 200 }));
    try {
      const { org, pod } = await makeOrgTournamentPod([
        { url: serverA.url, secret: "secret-a" },
        { url: serverB.url, secret: "secret-b" },
      ]);
      await sendWebhookEvent(org.id, pod.id, "round.completed", { roundId: "r1" });

      expect(serverA.requests).toHaveLength(1);
      expect(serverB.requests).toHaveLength(1);
      // Same body, but signed with each webhook's own secret — not interchangeable.
      expect(serverA.requests[0]!.body).toBe(serverB.requests[0]!.body);
      expect(serverA.requests[0]!.headers["x-limitedgauntlet-signature"]).not.toBe(
        serverB.requests[0]!.headers["x-limitedgauntlet-signature"],
      );
    } finally {
      await serverA.close();
      await serverB.close();
    }
  });

  it("still delivers to the other webhooks when one is unreachable", async () => {
    const server = await withTestServer(() => ({ status: 200 }));
    try {
      const { org, pod } = await makeOrgTournamentPod([
        { url: `http://${ownNonLoopbackAddress()}:1/dead`, secret: "s1" }, // nothing listens here
        { url: server.url, secret: "s2" },
      ]);
      await expect(sendWebhookEvent(org.id, pod.id, "round.started", {})).resolves.toBeUndefined();
      expect(server.requests).toHaveLength(1);
    } finally {
      await server.close();
    }
  });
});

describe("buildMatchesPayload / buildStandingsPayload", () => {
  it("resolves entrant display names for matches and ranks standings", async () => {
    const unique = `${Date.now()}-${Math.random()}`;
    const org = await prisma.organization.create({ data: { slug: `webhook-payload-${unique}`, name: "Test Org" } });
    const tournament = await prisma.tournament.create({
      data: { orgId: org.id, name: "Test Tournament", startDate: new Date(), endDate: new Date() },
    });
    const pod = await prisma.pod.create({
      data: { tournamentId: tournament.id, name: "Test Pod", format: "DRAFT", sequenceOrder: 0, roundCount: 1 },
    });
    const [alice, bob] = await Promise.all([
      prisma.player.create({ data: { orgId: org.id, displayName: "Alice" } }),
      prisma.player.create({ data: { orgId: org.id, displayName: "Bob" } }),
    ]);
    const [entrantA, entrantB] = await Promise.all([
      prisma.entrant.create({ data: { podId: pod.id, playerId: alice!.id } }),
      prisma.entrant.create({ data: { podId: pod.id, playerId: bob!.id } }),
    ]);
    const round = await prisma.round.create({ data: { podId: pod.id, roundNumber: 1, status: "ACTIVE" } });
    await prisma.match.create({
      data: {
        roundId: round.id,
        tableNumber: 1,
        entrantAId: entrantA!.id,
        entrantBId: entrantB!.id,
        result: "A_WINS",
        gamesWonA: 2,
        gamesWonB: 0,
        reportedAt: new Date(),
      },
    });

    const matches = await buildMatchesPayload(pod.id, round.id);
    expect(matches).toEqual([
      { tableNumber: 1, entrantA: { id: entrantA!.id, name: "Alice" }, entrantB: { id: entrantB!.id, name: "Bob" } },
    ]);

    const standings = await buildStandingsPayload(pod.id);
    expect(standings[0]).toMatchObject({ rank: 1, entrant: { id: entrantA!.id, name: "Alice" }, points: 3 });
    expect(standings[1]).toMatchObject({ rank: 2, entrant: { id: entrantB!.id, name: "Bob" }, points: 0 });
  });
});

describe("sendTestWebhookEvent", () => {
  it("targets one specific webhook by id, not all of an org's webhooks", async () => {
    const serverA = await withTestServer(() => ({ status: 200 }));
    const serverB = await withTestServer(() => ({ status: 200 }));
    try {
      const org = await prisma.organization.create({
        data: {
          slug: `webhook-test-send-${Date.now()}-${Math.random()}`,
          name: "Test Org",
          webhooks: {
            create: [
              { url: serverA.url, secret: "secret-a" },
              { url: serverB.url, secret: "secret-b" },
            ],
          },
        },
        include: { webhooks: true },
      });
      const [webhookA] = org.webhooks;

      const result = await sendTestWebhookEvent(org.id, webhookA!.id);
      expect(result).toEqual({ ok: true, status: 200 });
      expect(serverA.requests).toHaveLength(1);
      expect(serverB.requests).toHaveLength(0);
      expect(JSON.parse(serverA.requests[0]!.body).event).toBe("test");
    } finally {
      await serverA.close();
      await serverB.close();
    }
  });

  it("returns not_found for an unknown or cross-org webhook id", async () => {
    const org = await prisma.organization.create({
      data: { slug: `webhook-test-send-2-${Date.now()}-${Math.random()}`, name: "Test Org" },
    });
    await expect(sendTestWebhookEvent(org.id, "does-not-exist")).resolves.toEqual({ ok: false, error: "not_found" });
  });
});
