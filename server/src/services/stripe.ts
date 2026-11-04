// Shared Stripe wiring for the hosted instance — the one place the API version
// is pinned and the client is built, plus the defensive field readers that
// cope with Stripe moving fields across versions. Both the webhook/checkout
// adapter (routes/billing.ts) and the reconciliation job
// (services/reconcileSubscriptions.ts) import from here so they can never drift
// onto different API versions.
import Stripe from "stripe";
import { config } from "../config.js";

// Pinned to the API version stripe-node 23.1.0 ships with. Managed Payments'
// `managed_payments[enabled]` is a stable, typed param since 2025-03-31.basil,
// so no preview version is needed. Bump together with the stripe package.
export const STRIPE_API_VERSION = "2026-10-28.endive";

export function stripeClient(): Stripe {
  return new Stripe(config.stripe.secretKey, { apiVersion: STRIPE_API_VERSION });
}

// One recurring interval → months, for the retention window. interval_count
// covers e.g. a hypothetical quarterly price.
export function intervalToMonths(interval: string, count: number): number {
  if (interval === "year") return 12 * count;
  if (interval === "month") return count;
  if (interval === "week") return Math.max(1, Math.round((count * 7) / 30));
  if (interval === "day") return Math.max(1, Math.round(count / 30));
  return count;
}

// The subscription link on an invoice, read defensively: the field has moved
// across recent API versions (top-level `subscription` vs. the newer
// `parent.subscription_details.subscription`), so check both.
export function extractSubscriptionId(invoice: Stripe.Invoice): string | null {
  const inv = invoice as unknown as {
    subscription?: string | { id: string } | null;
    parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
  };
  const direct = inv.subscription ?? inv.parent?.subscription_details?.subscription ?? null;
  if (!direct) return null;
  return typeof direct === "string" ? direct : direct.id;
}

// current_period_end (unix seconds), read defensively for the same
// cross-version reason — it may sit on the subscription or on its first item.
export function extractCurrentPeriodEnd(sub: Stripe.Subscription): number | null {
  const s = sub as unknown as {
    current_period_end?: number | null;
    items?: { data?: Array<{ current_period_end?: number | null }> } | null;
  };
  return s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? null;
}
