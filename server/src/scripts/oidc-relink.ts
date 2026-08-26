// Operator recovery CLI for a conflicting OIDC subject binding (PI-49).
//
// Background: an organizer's account is bound to a stable `oidcSubject`. If
// their identity provider account is deleted and recreated with the same
// mailbox (Pocket ID's documented behavior — see ROADMAP.md PI-49), the new
// subject won't match, and a normal SSO login refuses to establish a session
// ("recovery_required") rather than silently trusting email equality alone.
// The app then emails a confirmation link to relink it — but that requires
// SMTP to be configured. This script is the fallback for solo/SSO-only
// deployments with no SMTP: it requires direct host/operator access (the same
// trust boundary as scripts/import-legacy.ts — there is no HTTP route for
// this), previews the exact change, and requires an explicit confirmation
// before applying it.
//
// The pending subject itself is never taken from a CLI argument — only from
// an OidcSubjectRelinkRequest row, which is only ever created after a real
// OIDC login already verified the identity's email (see
// linkOrProvisionFromOidc in routes/auth.ts). This script can only apply a
// relink that a real login attempt already recorded; it cannot fabricate one.
//
//   docker compose exec app node server/dist/scripts/oidc-relink.js organizer@example.com
//   docker compose exec app node server/dist/scripts/oidc-relink.js organizer@example.com --yes
import { createInterface } from "node:readline/promises";
import { prisma } from "../prisma.js";
import { confirmOidcRelinkByRequestId, findPendingOidcRelink } from "../services/oidcRelink.js";

async function confirm(promptText: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(promptText);
    return answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

async function main() {
  const [email, ...rest] = process.argv.slice(2);
  const autoConfirm = rest.includes("--yes");

  if (!email) {
    console.error("Usage: oidc-relink.js <organizer-email> [--yes]");
    process.exitCode = 1;
    return;
  }

  const { organizer, request } = await findPendingOidcRelink(email);
  if (!organizer) {
    console.error(`No organizer account found for "${email}".`);
    process.exitCode = 1;
    return;
  }
  if (!request) {
    console.error(
      `No pending SSO relink request for "${email}". A conflicting SSO login attempt must happen first ` +
        `(the organizer tries to sign in via SSO, gets refused, and that failed attempt records the pending request).`,
    );
    process.exitCode = 1;
    return;
  }

  console.log("Pending OIDC subject relink:");
  console.log(`  Organizer:            ${request.organizerName} <${request.organizerEmail}> (${request.organizerId})`);
  console.log(`  Current oidcSubject:  ${request.currentOidcSubject ?? "(none)"}`);
  console.log(`  Pending new subject:  ${request.pendingSubject}`);
  console.log(`  Requested at:         ${request.createdAt.toISOString()}`);
  console.log(`  Expires at:           ${request.expiresAt.toISOString()}`);
  console.log("");
  console.log(
    "Confirming will replace the account's oidcSubject with the pending value above, and immediately revoke " +
      "every existing session and API token for this organizer (they will need to sign in again).",
  );

  const confirmed = autoConfirm || (await confirm('Type "yes" to confirm this relink: '));
  if (!confirmed) {
    console.log("Aborted. No changes made.");
    return;
  }

  await confirmOidcRelinkByRequestId(request.requestId);
  console.log(`Relink confirmed for organizer ${request.organizerId}. Sessions and API tokens revoked.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
