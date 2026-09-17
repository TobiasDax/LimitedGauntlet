import { afterAll, afterEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { makePrismaClient } from "../db.js";
import { config } from "../config.js";
import { configuredSsoProviders } from "../config.js";
import { confirmOidcRelink, createUnverifiedLocalLinkRequest } from "./oidcRelink.js";
import { linkOrProvisionFromSso, parseDiscordUser, type SsoIdentity } from "./sso.js";

const prisma = makePrismaClient();

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
      data: {
        name: "A",
        email: `a-${Math.random()}@x.com`,
        passwordHash: "h",
        oidcSubject: `google:${sub}`,
        memberships: { create: { orgId: org.id } },
      },
    });
    const res = await linkOrProvisionFromSso("google", verified({ subject: sub }), "https://app.example");
    expect(res).toEqual({ status: "ok", organizerId: acc.id, authVersion: acc.authVersion, landOrgId: undefined });
  });

  it("links an unbound, verified account by email, storing the prefixed subject", async () => {
    const org = await makeOrg();
    const email = `link-${Math.random()}@example.com`;
    const sub = uniq("disc");
    // localEmailVerifiedAt set — e.g. a grandfathered pre-PI-125 account, or
    // one created via invite/SSO registration — so the direct link path
    // applies. See the PI-125 test below for the unverified case.
    const acc = await prisma.organizerAccount.create({
      data: {
        name: "B",
        email,
        passwordHash: "h",
        localEmailVerifiedAt: new Date(),
        memberships: { create: { orgId: org.id } },
      },
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
      data: {
        name: "C",
        email,
        passwordHash: "h",
        oidcSubject: `google:${uniq("first")}`,
        memberships: { create: { orgId: org.id } },
      },
    });
    const res = await linkOrProvisionFromSso(
      "discord",
      verified({ subject: uniq("second"), email }),
      "https://app.example",
    );
    expect(res.status).toBe("recovery_required");
  });

  it("PI-86: an SSO login for an existing account consumes a pending invite, adding a membership", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const email = `multi-${Math.random()}@example.com`;
    const sub = uniq("multi");
    const acc = await prisma.organizerAccount.create({
      data: {
        name: "M",
        email,
        passwordHash: "h",
        oidcSubject: `google:${sub}`,
        memberships: { create: { orgId: orgA.id } },
      },
    });
    const invite = await prisma.organizerInvite.create({
      data: {
        orgId: orgB.id,
        email,
        tokenHash: `hash-${Math.random()}`,
        invitedById: acc.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const res = await linkOrProvisionFromSso("google", verified({ subject: sub, email }), "https://app.example");
    expect(res).toEqual({ status: "ok", organizerId: acc.id, authVersion: acc.authVersion, landOrgId: orgB.id });

    const memberships = await prisma.organizerMembership.findMany({
      where: { accountId: acc.id },
      select: { orgId: true },
    });
    expect(memberships.map((m) => m.orgId).sort()).toEqual([orgA.id, orgB.id].sort());
    expect((await prisma.organizerInvite.findUniqueOrThrow({ where: { id: invite.id } })).usedAt).not.toBeNull();
  });

  // PI-124 — the known-subject branch used to consume a pending invite using
  // whatever email the identity provider reported this login, without ever
  // checking emailVerified (that check only ran later, in the byEmail
  // branch). A returning, already-linked account whose provider reports an
  // unverified email must not be able to claim someone else's invite just by
  // having that email attached at login time.
  it("PI-124: a known subject with an unverified email does not consume a pending invite for it", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const email = `unverified-${Math.random()}@example.com`;
    const sub = uniq("unverified-known");
    const acc = await prisma.organizerAccount.create({
      data: {
        name: "U",
        email: `holder-${Math.random()}@example.com`,
        passwordHash: "h",
        oidcSubject: `google:${sub}`,
        memberships: { create: { orgId: orgA.id } },
      },
    });
    const invite = await prisma.organizerInvite.create({
      data: {
        orgId: orgB.id,
        email,
        tokenHash: `hash-${Math.random()}`,
        invitedById: acc.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const res = await linkOrProvisionFromSso(
      "google",
      verified({ subject: sub, email, emailVerified: false }),
      "https://app.example",
    );
    expect(res).toEqual({ status: "ok", organizerId: acc.id, authVersion: acc.authVersion, landOrgId: undefined });

    const memberships = await prisma.organizerMembership.findMany({
      where: { accountId: acc.id },
      select: { orgId: true },
    });
    expect(memberships.map((m) => m.orgId)).toEqual([orgA.id]);
    expect((await prisma.organizerInvite.findUniqueOrThrow({ where: { id: invite.id } })).usedAt).toBeNull();
  });

  // PI-125 — full attacker-preregistration exploit: an attacker signs up
  // locally with the victim's email (never verified, since local signup
  // can't prove that), setting a password only the attacker knows. The real
  // victim later signs in via a real, verified SSO identity for that same
  // email, with a pending co-organizer invite waiting. Before the fix this
  // would have linked instantly, leaving the attacker's password (and any
  // session/API token they'd already created) valid on the now-linked
  // account. After the fix: no silent link, and only after mailbox
  // confirmation does the attacker's password/sessions/tokens die and the
  // victim get their intended access.
  it("PI-125: attacker preregistration is neutralized by mailbox confirmation, victim keeps intended access", async () => {
    const orgB = await makeOrg();
    const email = `victim-${Math.random()}@example.com`;
    const attackerPassword = "attacker-controls-this-password!";
    const preregistered = await prisma.organizerAccount.create({
      data: {
        name: "Attacker-chosen name",
        email,
        passwordHash: await hashPassword(attackerPassword),
        memberships: { create: { orgId: (await makeOrg()).id } },
        // localEmailVerifiedAt intentionally omitted: local signup never
        // proved the attacker controls `email`.
      },
    });
    const attackerToken = await prisma.apiToken.create({
      data: {
        organizerId: preregistered.id,
        orgId: orgB.id,
        name: "attacker token",
        tokenHash: `hash-${Math.random()}`,
      },
    });
    const invite = await prisma.organizerInvite.create({
      data: {
        orgId: orgB.id,
        email,
        tokenHash: `hash-${Math.random()}`,
        invitedById: preregistered.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    // The victim's real, verified SSO login.
    const sub = uniq("victim-sub");
    const firstAttempt = await linkOrProvisionFromSso(
      "google",
      verified({ subject: sub, email }),
      "https://app.example",
    );
    expect(firstAttempt).toEqual({ status: "recovery_required", emailSent: false });

    // Nothing changed yet: no silent link, attacker's password/token/invite
    // all still exactly as they were.
    const stillPreregistered = await prisma.organizerAccount.findUniqueOrThrow({ where: { id: preregistered.id } });
    expect(stillPreregistered.oidcSubject).toBeNull();
    expect(await verifyPassword(stillPreregistered.passwordHash!, attackerPassword)).toBe(true);
    expect(await prisma.apiToken.findUnique({ where: { id: attackerToken.id } })).not.toBeNull();
    expect((await prisma.organizerInvite.findUniqueOrThrow({ where: { id: invite.id } })).usedAt).toBeNull();

    // The victim clicks the emailed confirmation link.
    const { token } = await createUnverifiedLocalLinkRequest(preregistered.id, `google:${sub}`, email);
    await confirmOidcRelink(token);

    const recovered = await prisma.organizerAccount.findUniqueOrThrow({ where: { id: preregistered.id } });
    expect(recovered.passwordHash).toBeNull(); // old (attacker) password now fails outright
    expect(recovered.authVersion).toBeGreaterThan(stillPreregistered.authVersion); // old cookies fail (authVersion check)
    expect(recovered.oidcSubject).toBe(`google:${sub}`);
    expect(await prisma.apiToken.findUnique({ where: { id: attackerToken.id } })).toBeNull(); // preexisting tokens fail

    // The victim's next real login retains intended access: recognized by
    // subject now, and the pending invite is finally consumed.
    const secondAttempt = await linkOrProvisionFromSso(
      "google",
      verified({ subject: sub, email }),
      "https://app.example",
    );
    expect(secondAttempt).toEqual({
      status: "ok",
      organizerId: preregistered.id,
      authVersion: recovered.authVersion,
      landOrgId: orgB.id,
    });
    expect((await prisma.organizerInvite.findUniqueOrThrow({ where: { id: invite.id } })).usedAt).not.toBeNull();
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
