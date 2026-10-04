// HI-7 follow-up — the reconciliation backstop (ROADMAP-HOSTED.md "Next steps").
//
// Webhooks are the primary path; this is the safety net for the rare missed
// one (the app was down through Stripe's retries, say). It lists live Stripe
// subscriptions and replays each one's latest *paid* invoice through the same
// idempotent applySubscriptionPayment the webhook uses, keyed on the same
// invoice id. So a payment the webhook already handled is a no-op (duplicate),
// and one it missed gets applied — bringing the org's expiry (and cumulative
// retention months) back in line with Stripe without ever double-granting.
//
// It only ever moves an org *up* to what Stripe says it paid for; it never
// revokes (a cancelled sub still lapses naturally at its paid-through date, as
// in the webhook path). Processor-specific, so it sits beside the Stripe
// adapter wiring in services/stripe.ts rather than in the agnostic Layer A.
import type Stripe from "stripe";
import { isStripeConfigured } from "../config.js";
import { prisma } from "../prisma.js";
import { applySubscriptionPayment } from "./billing.js";
import { stripeClient, intervalToMonths, extractCurrentPeriodEnd } from "./stripe.js";

export interface ReconcileCorrection {
  orgId: string;
  invoiceId: string;
  periodEnd: string;
}

export interface ReconcileSummary {
  scanned: number;
  corrected: number; // a missed payment this run applied (or would, in a dry run)
  alreadyCurrent: number; // the webhook had already recorded this invoice
  skipped: number; // not active/trialing, or missing org id / paid invoice / period
  errors: number; // a single subscription failed; the run continued
  corrections: ReconcileCorrection[];
  dryRun: boolean;
}

// The paid invoice that anchors idempotency: its id is the key the webhook also
// uses, so replaying it dedupes against the webhook's row. Read defensively —
// `latest_invoice` is a string when unexpanded, an object when expanded.
function paidInvoiceOf(sub: Stripe.Subscription): { id: string; amountCents?: number; currency?: string } | null {
  const raw = (sub as unknown as { latest_invoice?: unknown }).latest_invoice;
  if (!raw || typeof raw !== "object") return null;
  const inv = raw as { id?: string; status?: string; amount_paid?: number | null; currency?: string | null };
  if (!inv.id || inv.status !== "paid") return null;
  return {
    id: inv.id,
    amountCents: inv.amount_paid ?? undefined,
    currency: inv.currency ?? undefined,
  };
}

export async function reconcileSubscriptions(opts: { dryRun?: boolean } = {}): Promise<ReconcileSummary> {
  const dryRun = opts.dryRun ?? false;
  const summary: ReconcileSummary = {
    scanned: 0,
    corrected: 0,
    alreadyCurrent: 0,
    skipped: 0,
    errors: 0,
    corrections: [],
    dryRun,
  };
  if (!isStripeConfigured()) return summary;

  const stripe = stripeClient();
  // `status: "all"` then filter in code: only a currently-entitled sub
  // (active or trialing) has a paid-through period worth reconciling. A
  // past_due / cancelled / incomplete one lapses on its own.
  for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100, expand: ["data.latest_invoice"] })) {
    summary.scanned += 1;
    try {
      if (sub.status !== "active" && sub.status !== "trialing") {
        summary.skipped += 1;
        continue;
      }
      const orgId = sub.metadata?.orgId;
      const periodEndSec = extractCurrentPeriodEnd(sub);
      const invoice = paidInvoiceOf(sub);
      if (!orgId || !periodEndSec || !invoice) {
        summary.skipped += 1;
        continue;
      }
      const periodEnd = new Date(periodEndSec * 1000);
      const recurring = sub.items.data[0]?.price.recurring;
      const months = recurring ? intervalToMonths(recurring.interval, recurring.interval_count) : 1;

      if (dryRun) {
        const existing = await prisma.billingEvent.findUnique({ where: { processorEventId: invoice.id } });
        if (existing) summary.alreadyCurrent += 1;
        else {
          summary.corrected += 1;
          summary.corrections.push({ orgId, invoiceId: invoice.id, periodEnd: periodEnd.toISOString() });
        }
        continue;
      }

      const result = await applySubscriptionPayment(orgId, invoice.id, periodEnd, months, {
        amountCents: invoice.amountCents,
        currency: invoice.currency,
      });
      if (result.applied) {
        summary.corrected += 1;
        summary.corrections.push({ orgId, invoiceId: invoice.id, periodEnd: periodEnd.toISOString() });
      } else {
        summary.alreadyCurrent += 1;
      }
    } catch {
      // One bad subscription shouldn't abort the whole sweep — count it and
      // move on. The CLI surfaces a non-zero error count as a failed run.
      summary.errors += 1;
    }
  }

  return summary;
}
