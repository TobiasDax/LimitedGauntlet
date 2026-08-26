import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../prisma.js";

const PURPOSE = "SUBJECT_RELINK";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createOidcRelinkRequest(organizerId: string, pendingSubject: string, email: string) {
  const token = randomBytes(32).toString("hex");
  const request = await prisma.oidcSubjectRelinkRequest.create({
    data: { organizerId, pendingSubject, email, purpose: PURPOSE, tokenHash: hash(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  return { request, token };
}

export async function confirmOidcRelink(token: string) {
  const tokenHash = hash(token);
  return prisma.$transaction(async (tx) => {
    const request = await tx.oidcSubjectRelinkRequest.findUnique({ where: { tokenHash }, include: { organizer: true } });
    if (!request || request.usedAt || request.expiresAt <= new Date() || request.purpose !== PURPOSE || request.email !== request.organizer.email) {
      throw new Error("invalid_oidc_relink");
    }
    const claimed = await tx.oidcSubjectRelinkRequest.updateMany({ where: { id: request.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw new Error("invalid_oidc_relink");
    await tx.organizerAccount.update({ where: { id: request.organizerId }, data: { oidcSubject: request.pendingSubject, authVersion: { increment: 1 } } });
    await tx.apiToken.deleteMany({ where: { organizerId: request.organizerId } });
    await tx.oidcSubjectRelinkRequest.updateMany({ where: { organizerId: request.organizerId, usedAt: null }, data: { usedAt: new Date() } });
    return { organizerId: request.organizerId };
  });
}
