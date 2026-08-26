import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
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

type PendingRelinkRequest = { id: string; organizerId: string; pendingSubject: string };

// Shared by both confirmation paths: rotates the account's authVersion
// (revoking every existing session, including realtime subscriptions —
// see server/src/realtime.ts) and API tokens, and consumes every other
// outstanding relink request for the account so an older/different pending
// subject can't be replayed after this one lands.
async function applyOidcRelink(tx: Prisma.TransactionClient, request: PendingRelinkRequest): Promise<void> {
  const claimed = await tx.oidcSubjectRelinkRequest.updateMany({ where: { id: request.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) throw new Error("invalid_oidc_relink");
  await tx.organizerAccount.update({ where: { id: request.organizerId }, data: { oidcSubject: request.pendingSubject, authVersion: { increment: 1 } } });
  await tx.apiToken.deleteMany({ where: { organizerId: request.organizerId } });
  await tx.oidcSubjectRelinkRequest.updateMany({ where: { organizerId: request.organizerId, usedAt: null }, data: { usedAt: new Date() } });
}

// Mailbox-confirmed path: the caller possesses the raw token from the emailed
// link, proving control of the account's existing email.
export async function confirmOidcRelink(token: string): Promise<{ organizerId: string }> {
  const tokenHash = hash(token);
  return prisma.$transaction(async (tx) => {
    const request = await tx.oidcSubjectRelinkRequest.findUnique({ where: { tokenHash }, include: { organizer: true } });
    if (!request || request.usedAt || request.expiresAt <= new Date() || request.purpose !== PURPOSE || request.email !== request.organizer.email) {
      throw new Error("invalid_oidc_relink");
    }
    await applyOidcRelink(tx, request);
    return { organizerId: request.organizerId };
  });
}

// Operator-confirmed path (PI-49), for SMTP-less deployments where no relink
// email could be sent. Authorization here is direct host/operator access to
// run the recovery CLI (scripts/oidc-relink.ts) — NOT token possession — so
// this must never be reachable from an HTTP route; the CLI is responsible for
// resolving the request via findPendingOidcRelink and getting an explicit
// interactive confirmation before calling this. The pending subject itself
// still always originates from a verified OIDC login (createOidcRelinkRequest
// is only ever called after the identity's email_verified check), never from
// operator input.
export async function confirmOidcRelinkByRequestId(requestId: string): Promise<{ organizerId: string }> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.oidcSubjectRelinkRequest.findUnique({ where: { id: requestId }, include: { organizer: true } });
    if (!request || request.usedAt || request.expiresAt <= new Date() || request.purpose !== PURPOSE || request.email !== request.organizer.email) {
      throw new Error("invalid_oidc_relink");
    }
    await applyOidcRelink(tx, request);
    return { organizerId: request.organizerId };
  });
}

export interface PendingOidcRelink {
  requestId: string;
  organizerId: string;
  organizerName: string;
  organizerEmail: string;
  currentOidcSubject: string | null;
  pendingSubject: string;
  createdAt: Date;
  expiresAt: Date;
}

// Looks up the organizer by email and their most recent still-usable relink
// request, for the operator CLI to preview before confirming.
export async function findPendingOidcRelink(email: string): Promise<
  { organizer: null; request: null } | { organizer: { id: string; name: string; email: string; oidcSubject: string | null }; request: PendingOidcRelink | null }
> {
  const organizer = await prisma.organizerAccount.findUnique({ where: { email } });
  if (!organizer) return { organizer: null, request: null };

  const pending = await prisma.oidcSubjectRelinkRequest.findFirst({
    where: { organizerId: organizer.id, purpose: PURPOSE, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  return {
    organizer: { id: organizer.id, name: organizer.name, email: organizer.email, oidcSubject: organizer.oidcSubject },
    request: pending
      ? {
          requestId: pending.id,
          organizerId: organizer.id,
          organizerName: organizer.name,
          organizerEmail: organizer.email,
          currentOidcSubject: organizer.oidcSubject,
          pendingSubject: pending.pendingSubject,
          createdAt: pending.createdAt,
          expiresAt: pending.expiresAt,
        }
      : null,
  };
}
