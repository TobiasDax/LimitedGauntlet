import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { proxyTrackingScript, proxyTrackingSend, truncateIp } from "./tracking.js";

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

describe("truncateIp (PI-108)", () => {
  it("zeroes the last IPv4 octet", () => {
    expect(truncateIp("203.0.113.45")).toBe("203.0.113.0");
    expect(truncateIp("192.168.1.255")).toBe("192.168.1.0");
  });

  it("handles IPv4-mapped IPv6", () => {
    expect(truncateIp("::ffff:203.0.113.45")).toBe("203.0.113.0");
  });

  it("keeps only the /48 prefix of an IPv6 address", () => {
    expect(truncateIp("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe("2001:db8:85a3::");
    expect(truncateIp("2001:db8:1234::1")).toBe("2001:db8:1234::");
  });

  // PI-129 — naively splitting on ":" and dropping empty strings loses
  // exactly the zero groups "::" stands for, so a compression that falls
  // within (not after) the kept /48 prefix silently kept host bits instead:
  // this exact address used to truncate to "2001:db8:1234::" (treating
  // "1234" as the third real group), not the correct "2001:db8::".
  it("correctly expands a compression that falls within the kept /48 prefix (the reported bug)", () => {
    expect(truncateIp("2001:db8::1234:5678")).toBe("2001:db8::");
  });

  it("handles compression at either end, and the fully-compressed addresses", () => {
    expect(truncateIp("::1")).toBe("::"); // loopback — no real prefix to keep
    expect(truncateIp("2001:db8::")).toBe("2001:db8::"); // already just a prefix
    expect(truncateIp("::")).toBe("::"); // unspecified address
  });

  it("equivalent compressed and uncompressed forms produce the same prefix", () => {
    const compressed = truncateIp("2001:db8::1234:5678");
    const expanded = truncateIp("2001:0db8:0000:0000:0000:0000:1234:5678");
    expect(compressed).toBe(expanded);
  });

  it("strips a zone id before parsing", () => {
    expect(truncateIp("fe80::1%eth0")).toBe("fe80::");
  });

  it("falls back to the fully-zeroed address for unparseable IPv6-shaped input, never the raw value", () => {
    expect(truncateIp("garbage::still:has:a:colon:in:it:here")).toBe("::");
  });

  it("passes through anything that isn't an IP", () => {
    expect(truncateIp("unknown")).toBe("unknown");
  });
});

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

  it("returns 504 instead of throwing when the upstream is unreachable", async () => {
    // Port 1: nothing listens there, so the request fails fast (connection
    // refused) rather than actually waiting out the 5s timeout — exercises
    // the same catch branch a real hang/timeout would hit.
    const result = await proxyTrackingScript("http://127.0.0.1:1/script.js");
    expect(result.status).toBe(504);
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

  it("returns 504 instead of throwing when the upstream is unreachable", async () => {
    const result = await proxyTrackingSend("http://127.0.0.1:1", "{}", {});
    expect(result.status).toBe(504);
  });
});
