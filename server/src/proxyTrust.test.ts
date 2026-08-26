import Fastify from "fastify";
import fastifyRateLimit from "@fastify/rate-limit";
import { describe, expect, it } from "vitest";
import { parseTrustedProxies } from "./proxyTrust.js";

describe("parseTrustedProxies", () => {
  it("defaults to no proxy trust", () => {
    expect(parseTrustedProxies(undefined)).toBe(false);
    expect(parseTrustedProxies("  ")).toBe(false);
  });

  it("accepts exact IPs and bounded CIDRs", () => {
    expect(parseTrustedProxies("172.30.0.2, 2001:db8::1,10.0.0.0/24")).toEqual([
      "172.30.0.2", "2001:db8::1", "10.0.0.0/24",
    ]);
  });

  it.each(["true", "*", "proxy", "0.0.0.0/0", "::/0", "10.0.0.0/33", "2001:db8::/129", "10.0.0.1,"])(
    "rejects unsafe or malformed value %s",
    (value) => expect(() => parseTrustedProxies(value)).toThrow(/TRUSTED_PROXIES/),
  );
});

async function limitedApp(trustProxy: false | string[]) {
  const app = Fastify({ trustProxy });
  await app.register(fastifyRateLimit, { max: 2, timeWindow: "1 minute" });
  app.get("/", async (request) => ({ ip: request.ip }));
  return app;
}

describe("rate-limit request identity", () => {
  it("ignores rotated forwarding headers from a direct client", async () => {
    const app = await limitedApp(false);
    expect((await app.inject({ url: "/", headers: { "x-forwarded-for": "1.1.1.1" } })).statusCode).toBe(200);
    expect((await app.inject({ url: "/", headers: { "x-forwarded-for": "2.2.2.2" } })).statusCode).toBe(200);
    expect((await app.inject({ url: "/", headers: { "x-forwarded-for": "3.3.3.3" } })).statusCode).toBe(429);
    await app.close();
  });

  it("uses forwarded clients only from an explicitly trusted peer", async () => {
    const app = await limitedApp(["127.0.0.1"]);
    const one = await app.inject({ url: "/", headers: { "x-forwarded-for": "9.9.9.9" } });
    const two = await app.inject({ url: "/", headers: { "x-forwarded-for": "8.8.8.8" } });
    expect(one.json()).toEqual({ ip: "9.9.9.9" });
    expect(two.json()).toEqual({ ip: "8.8.8.8" });
    await app.close();
  });

  it("ignores forwarding headers from a peer outside the allowlist", async () => {
    const app = await limitedApp(["10.0.0.2"]);
    const request = (forwardedFor: string) => app.inject({
      url: "/",
      remoteAddress: "192.0.2.10",
      headers: { "x-forwarded-for": forwardedFor },
    });
    expect((await request("1.1.1.1")).json()).toEqual({ ip: "192.0.2.10" });
    expect((await request("2.2.2.2")).statusCode).toBe(200);
    expect((await request("3.3.3.3")).statusCode).toBe(429);
    await app.close();
  });

  it("uses the rightmost untrusted address in a forwarded chain", async () => {
    const app = await limitedApp(["127.0.0.1"]);
    const response = await app.inject({ url: "/", headers: { "x-forwarded-for": "1.1.1.1, 9.9.9.9" } });
    expect(response.json()).toEqual({ ip: "9.9.9.9" });
    await app.close();
  });
});
