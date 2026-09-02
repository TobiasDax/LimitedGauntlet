import { afterAll, afterEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { config } from "../config.js";
import { configuredSsoProviders } from "../config.js";
import { linkOrProvisionFromSso, parseDiscordUser, type SsoIdentity } from "./sso.js";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("parseDiscordUser", () => {
  it("maps a verified Discord user to an identity", () => {
    const id = parseDiscordUser({
      id: "88442211",
      username: "raccoon",
      global_name: "Raccoon",
      email: "Raccoon@Example.com",
      verified: true,
    });
    expect(id).toEqual({ subject: "88442211", email: "raccoon@example.com", emailVerified: true, name: "Raccoon" });
  });

  it("treats an unverified email as not verified", () => {
    expect(parseDiscordUser({ id: "1", username: "u", email: "u@x.com", verified: false }).emailVerified).toBe(false);
  });

  it("treats a missing email as not verified", () => {
    const id = parseDiscordUser({ id: "1", username: "u", verified: true });
    expect(id.email).toBeNull();
    expect(id.emailVerified).toBe(false);
  });

  it("falls back to username when there is no global_name", () => {
    expect(parseDiscordUser({ id: "1", username: "legacy", global_name: null }).name).toBe("legacy");
  });

  it("throws when the payload has no id", () => {
    expect(() => parseDiscordUser({ username: "x" })).toThrow();
  });
});

describe("configuredSsoProviders", () => {
  const saved = {
    issuer: config.oidc.issuer,
    oid: config.oidc.clientId,
    osec: config.oidc.clientSecret,
    gid: config.google.clientId,
    gsec: config.google.clientSecret,
    did: config.discord.clientId,
    dsec: config.discord.clientSecret,
  };
  afterEach(() => {
    config.oidc.issuer = saved.issuer;
    config.oidc.clientId = saved.oid;
    config.oidc.clientSecret = saved.osec;
    config.google.clientId = saved.gid;
    config.google.clientSecret = saved.gsec;
    config.discord.clientId = saved.did;
    config.discord.clientSecret = saved.dsec;
  });

  it("is empty with nothing configured", () => {
    config.oidc.issuer = "";
    config.oidc.clientId = "";
    config.oidc.clientSecret = "";
    config.google.clientId = "";
    config.google.clientSecret = "";
    config.discord.clientId = "";
    config.discord.clientSecret = "";
    expect(configuredSsoProviders()).toEqual([]);
  });

  it("lists only providers whose id AND secret are set, in order", () => {
    config.oidc.issuer = "https://idp.example";
    config.oidc.clientId = "x";
    config.oidc.clientSecret = "y";
    config.oidc.providerName = "Pocket ID";
    config.google.clientId = "g";
    config.google.clientSecret = "gs";
    config.discord.clientId = "d";
    config.discord.clientSecret = ""; // half-configured → omitted
    expect(configuredSsoProviders()).toEqual([
      { id: "oidc", label: "Pocket ID" },
      { id: "google", label: "Google" },
    ]);
  });
});

describe("linkOrProvisionFromSso", () => {
  const verified = (over: Partial<SsoIdentity> = {}): SsoIdentity => ({
    subject: `sub-${Math.random()}`,
    email: `u-${Math.random()}@example.com`,
    emailVerified: true,
    name: "User",
    ...over,
  });

  async function makeOrg() {
    const u = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return prisma.organization.create({ data: { slug: `sso-${u}`, name: "SSO Org" } });
  }

  // oidcSubject is globally unique, so every subject a test actually writes has
  // to be unique across runs against a non-truncated DB (same rule as
  // oidcRelink.test.ts).
  const uniq = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  it("logs straight in on a known prefixed subject", async () => {
    const org = await makeOrg();
    const sub = uniq("known");
    const acc = await prisma.organizerAccount.create({
      data: { orgId: org.id, name: "A", email: `a-${Math.random()}@x.com`, passwordHash: "h", oidcSubject: `google:${sub}` },
    });
    const res = await linkOrProvisionFromSso("google", verified({ subject: sub }), "https://app.example");
    expect(res).toEqual({ status: "ok", organizerId: acc.id, authVersion: acc.authVersion });
  });

  it("links an unbound account by verified email, storing the prefixed subject", async () => {
    const org = await makeOrg();
    const email = `link-${Math.random()}@example.com`;
    const sub = uniq("disc");
    const acc = await prisma.organizerAccount.create({
      data: { orgId: org.id, name: "B", email, passwordHash: "h" },
    });
    const res = await linkOrProvisionFromSso("discord", verified({ subject: sub, email }), "https://app.example");
    expect(res.status).toBe("ok");
    const after = await prisma.organizerAccount.findUniqueOrThrow({ where: { id: acc.id } });
    expect(after.oidcSubject).toBe(`discord:${sub}`);
  });

  it("requires a relink when a second provider targets an already-bound account", async () => {
    const org = await makeOrg();
    const email = `two-${Math.random()}@example.com`;
    await prisma.organizerAccount.create({
      data: { orgId: org.id, name: "C", email, passwordHash: "h", oidcSubject: `google:${uniq("first")}` },
    });
    const res = await linkOrProvisionFromSso("discord", verified({ subject: uniq("second"), email }), "https://app.example");
    expect(res.status).toBe("recovery_required");
  });

  it("refuses an unverified email", async () => {
    const res = await linkOrProvisionFromSso("google", verified({ emailVerified: false }), "https://app.example");
    expect(res).toEqual({ status: "error", error: "oidc_email_unverified" });
  });

  it("refuses an unknown identity when signups are closed", async () => {
    const wasAllowed = config.allowSignup;
    config.allowSignup = false;
    try {
      const res = await linkOrProvisionFromSso("google", verified(), "https://app.example");
      expect(res).toEqual({ status: "error", error: "oidc_no_account" });
    } finally {
      config.allowSignup = wasAllowed;
    }
  });
});
