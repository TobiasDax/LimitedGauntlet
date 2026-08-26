import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  confirmOidcRelink,
  confirmOidcRelinkByRequestId,
  createOidcRelinkRequest,
  findPendingOidcRelink,
} from "./oidcRelink.js";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

// oidcSubject is globally unique on OrganizerAccount, so every subject value
// that might actually get written via a successful confirm needs to be
// unique across the whole file, not just within one test.
function subj(label: string): string {
  return `${label}-${Date.now()}-${Math.random()}`;
}

async function makeOrganizer(overrides?: { oidcSubject?: string | null }) {
  const unique = `${Date.now()}-${Math.random()}`;
  const org = await prisma.organization.create({ data: { slug: `oidc-relink-${unique}`, name: "Test Org" } });
  const organizer = await prisma.organizerAccount.create({
    data: {
      orgId: org.id,
      name: "Organizer",
      email: `organizer-${unique}@example.com`,
      passwordHash: null,
      oidcSubject: overrides?.oidcSubject ?? `old-subject-${unique}`,
    },
  });
  return { org, organizer };
}

describe("oidcRelink", () => {
  it("confirms a mailbox-token relink: rotates subject + authVersion, revokes API tokens, consumes other pending requests", async () => {
    const { organizer } = await makeOrganizer();
    await prisma.apiToken.create({
      data: { organizerId: organizer.id, name: "old token", tokenHash: `hash-${Math.random()}` },
    });
    const stale = await createOidcRelinkRequest(organizer.id, subj("stale-subject"), organizer.email);
    const newSubject = subj("new-subject");
    const { token } = await createOidcRelinkRequest(organizer.id, newSubject, organizer.email);

    const result = await confirmOidcRelink(token);
    expect(result.organizerId).toBe(organizer.id);

    const updated = await prisma.organizerAccount.findUniqueOrThrow({ where: { id: organizer.id } });
    expect(updated.oidcSubject).toBe(newSubject);
    expect(updated.authVersion).toBe(organizer.authVersion + 1);

    const tokens = await prisma.apiToken.findMany({ where: { organizerId: organizer.id } });
    expect(tokens).toHaveLength(0);

    const staleRow = await prisma.oidcSubjectRelinkRequest.findUniqueOrThrow({ where: { id: stale.request.id } });
    expect(staleRow.usedAt).not.toBeNull();
  });

  it("rejects an unknown, expired, or already-used token", async () => {
    const { organizer } = await makeOrganizer();
    await expect(confirmOidcRelink("not-a-real-token")).rejects.toThrow("invalid_oidc_relink");

    const { request, token } = await createOidcRelinkRequest(organizer.id, subj("new-subject"), organizer.email);
    await prisma.oidcSubjectRelinkRequest.update({ where: { id: request.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(confirmOidcRelink(token)).rejects.toThrow("invalid_oidc_relink");

    const { token: freshToken } = await createOidcRelinkRequest(organizer.id, subj("new-subject-2"), organizer.email);
    await confirmOidcRelink(freshToken);
    await expect(confirmOidcRelink(freshToken)).rejects.toThrow("invalid_oidc_relink");
  });

  it("rejects a token whose request email no longer matches the account's current email", async () => {
    const { organizer } = await makeOrganizer();
    const { token } = await createOidcRelinkRequest(organizer.id, subj("new-subject"), organizer.email);
    await prisma.organizerAccount.update({ where: { id: organizer.id }, data: { email: `changed-${organizer.email}` } });
    await expect(confirmOidcRelink(token)).rejects.toThrow("invalid_oidc_relink");
  });

  it("findPendingOidcRelink reports the organizer even with no pending request, and null for an unknown email", async () => {
    const { organizer } = await makeOrganizer();
    const noPending = await findPendingOidcRelink(organizer.email);
    expect(noPending.organizer?.id).toBe(organizer.id);
    expect(noPending.request).toBeNull();

    const unknown = await findPendingOidcRelink("nobody@example.com");
    expect(unknown.organizer).toBeNull();

    await createOidcRelinkRequest(organizer.id, "new-subject", organizer.email);
    const withPending = await findPendingOidcRelink(organizer.email);
    expect(withPending.request?.pendingSubject).toBe("new-subject");
    expect(withPending.request?.currentOidcSubject).toBe(organizer.oidcSubject);
  });

  it("confirms the operator-CLI path by request id, without a token, and applies the same effects", async () => {
    const { organizer } = await makeOrganizer();
    const operatorSubject = subj("operator-confirmed-subject");
    const { request } = await createOidcRelinkRequest(organizer.id, operatorSubject, organizer.email);

    const result = await confirmOidcRelinkByRequestId(request.id);
    expect(result.organizerId).toBe(organizer.id);

    const updated = await prisma.organizerAccount.findUniqueOrThrow({ where: { id: organizer.id } });
    expect(updated.oidcSubject).toBe(operatorSubject);
    expect(updated.authVersion).toBe(organizer.authVersion + 1);
  });

  it("rejects the operator-CLI path for an unknown or already-used request id", async () => {
    await expect(confirmOidcRelinkByRequestId("does-not-exist")).rejects.toThrow("invalid_oidc_relink");

    const { organizer } = await makeOrganizer();
    const { request } = await createOidcRelinkRequest(organizer.id, subj("new-subject"), organizer.email);
    await confirmOidcRelinkByRequestId(request.id);
    await expect(confirmOidcRelinkByRequestId(request.id)).rejects.toThrow("invalid_oidc_relink");
  });
});
