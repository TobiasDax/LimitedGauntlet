import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { proxyTrackingScript, proxyTrackingSend } from "./tracking.js";

async function withTestServer(
  handler: (req: IncomingMessage, body: string) => { status: number; contentType: string; body: string },
): Promise<{
  origin: string;
  close: () => Promise<void>;
  requests: { headers: Record<string, string | string[] | undefined>; body: string }[];
}> {
  const requests: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      requests.push({ headers: req.headers, body });
      const result = handler(req, body);
      res.writeHead(result.status, { "Content-Type": result.contentType });
      res.end(result.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    requests,
  };
}

describe("proxyTrackingScript", () => {
  it("relays the upstream script's status, content-type, and body verbatim", async () => {
    const upstream = await withTestServer(() => ({
      status: 200,
      contentType: "application/javascript; charset=UTF-8",
      body: "console.log('tracker')",
    }));
    try {
      const result = await proxyTrackingScript(`${upstream.origin}/script.js`);
      expect(result.status).toBe(200);
      expect(result.contentType).toBe("application/javascript; charset=UTF-8");
      expect(Buffer.from(result.body).toString("utf8")).toBe("console.log('tracker')");
    } finally {
      await upstream.close();
    }
  });

  it("relays a non-200 upstream status instead of throwing", async () => {
    const upstream = await withTestServer(() => ({ status: 404, contentType: "text/plain", body: "not found" }));
    try {
      const result = await proxyTrackingScript(`${upstream.origin}/script.js`);
      expect(result.status).toBe(404);
    } finally {
      await upstream.close();
    }
  });
});

describe("proxyTrackingSend", () => {
  it("forwards the event body and status verbatim, plus user-agent/x-forwarded-for", async () => {
    const upstream = await withTestServer(() => ({
      status: 200,
      contentType: "application/json",
      body: '{"cache":"ok"}',
    }));
    try {
      const result = await proxyTrackingSend(upstream.origin, '{"type":"event"}', {
        contentType: "application/json",
        userAgent: "TestAgent/1.0",
        forwardedFor: "203.0.113.5",
      });
      expect(result.status).toBe(200);
      expect(result.body).toBe('{"cache":"ok"}');
      expect(upstream.requests).toHaveLength(1);
      const req = upstream.requests[0]!;
      expect(req.body).toBe('{"type":"event"}');
      expect(req.headers["user-agent"]).toBe("TestAgent/1.0");
      expect(req.headers["x-forwarded-for"]).toBe("203.0.113.5");
    } finally {
      await upstream.close();
    }
  });

  it("omits optional headers rather than forwarding them empty when not provided", async () => {
    const upstream = await withTestServer(() => ({ status: 200, contentType: "application/json", body: "{}" }));
    try {
      await proxyTrackingSend(upstream.origin, "{}", {});
      const req = upstream.requests[0]!;
      expect(req.headers["x-forwarded-for"]).toBeUndefined();
    } finally {
      await upstream.close();
    }
  });
});
