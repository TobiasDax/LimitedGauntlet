// HI-7 follow-up — operator CLI for the subscription reconciliation backstop.
//
// Webhooks are the primary path; run this on a schedule (e.g. a daily cron) as
// a safety net for a missed one. It replays each live Stripe subscription's
// latest paid invoice through the same idempotent path the webhook uses, so an
// already-handled payment is a no-op and a missed one is applied. It never
// revokes. Same host-access trust boundary as the other scripts — no HTTP route.
//
//   docker compose exec app node server/dist/scripts/reconcile-subscriptions.js
//   docker compose exec app node server/dist/scripts/reconcile-subscriptions.js --dry-run
//
// Exits non-zero if any single subscription errored (so cron can alert), or if
// Stripe isn't configured (nothing to reconcile — a misconfiguration if you
// expected it to run).
import { isStripeConfigured } from "../config.js";
import { prisma } from "../prisma.js";
import { reconcileSubscriptions } from "../services/reconcileSubscriptions.js";

async function main(): Promise<void> {
  const dryRun = process.argv.slice(2).includes("--dry-run");

  if (!isStripeConfigured()) {
    console.error("Stripe isn't configured (STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET) — nothing to reconcile.");
    process.exitCode = 1;
    return;
  }

  const summary = await reconcileSubscriptions({ dryRun });

  const label = dryRun ? "[dry run] " : "";
  console.log(
    `${label}Reconciled Stripe subscriptions: scanned ${summary.scanned}, ` +
      `${dryRun ? "would correct" : "corrected"} ${summary.corrected}, ` +
      `already current ${summary.alreadyCurrent}, skipped ${summary.skipped}, errors ${summary.errors}.`,
  );
  for (const c of summary.corrections) {
    console.log(
      `  ${dryRun ? "would apply" : "applied"}: org ${c.orgId} ← invoice ${c.invoiceId} (paid through ${c.periodEnd})`,
    );
  }

  if (summary.errors > 0) process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
