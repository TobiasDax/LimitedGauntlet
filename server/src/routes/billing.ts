// HI-7 Layer B — the Stripe Managed Payments adapter.
//
// The only processor-specific code in the app. It verifies + parses Stripe's
// webhooks and calls services/billing.ts (Layer A) with normalised primitives;
// it also creates Checkout Sessions. Registered only when Stripe is configured
// (isStripeConfigured), so a self-hosted or un-configured deployment exposes
// none of this.
//
// Managed Payments is a Merchant-of-Record flag on standard Stripe Checkout —
// the single MP-specific parameter is `managed_payments: { enabled: true }` on
// session create. Everything else here is ordinary Checkout + Billing +
// Webhooks.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import Stripe from "stripe";
import { config, isStripeConfigured } from "../config.js";
import { requireAuth } from "../auth/middleware.js";
import { resolveBaseUrl } from "../services/mailer.js";
import { applySubscriptionPayment, recordPassPurchase, recordSubscriptionCancellation } from "../services/billing.js";

// Pin the API version Managed Payments requires (see docs/set-up). The SDK
// types a specific literal; this deployment is validated against it.
const STRIPE_API_VERSION = "2025-03-31.basil";

function stripeClient(): Stripe {
  return new Stripe(config.stripe.secretKey, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion });
}

// Which purchasable each product key maps to. Kept server-side so the client
// only ever names a plan, never a price id.
const checkoutSchema = z.object({ product: z.enum(["pass", "subscription_monthly", "subscription_annual"]) });

function priceFor(product: "pass" | "subscription_monthly" | "subscription_annual"): {
  price: string;
  mode: "payment" | "subscription";
} | null {
  switch (product) {
    case "pass":
      return config.stripe.pricePass ? { price: config.stripe.pricePass, mode: "payment" } : null;
    case "subscription_monthly":
      return config.stripe.priceSubscriptionMonthly
        ? { price: config.stripe.priceSubscriptionMonthly, mode: "subscription" }
        : null;
    case "subscription_annual":
      return config.stripe.priceSubscriptionAnnual
        ? { price: config.stripe.priceSubscriptionAnnual, mode: "subscription" }
        : null;
  }
}

// One recurring interval → months, for the retention window. interval_count
// covers e.g. a hypothetical quarterly price.
function intervalToMonths(interval: string, count: number): number {
  if (interval === "year") return 12 * count;
  if (interval === "month") return count;
  if (interval === "week") return Math.max(1, Math.round((count * 7) / 30));
  if (interval === "day") return Math.max(1, Math.round(count / 30));
  return count;
}

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  if (!isStripeConfigured()) return;

  // Start a hosted Checkout for the active org. Returns the Stripe URL the
  // client redirects to. The org id rides along as client_reference_id and in
  // metadata (and the subscription's own metadata) so every downstream event
  // ties back to the org without a lookup table.
  app.post("/api/billing/checkout", { preHandler: requireAuth }, async (request, reply) => {
    const body = checkoutSchema.safeParse(request.body);
    if (!body.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const selection = priceFor(body.data.product);
    if (!selection) {
      reply.code(400).send({ error: "product_unavailable" });
      return;
    }
    const orgId = request.organizer!.orgId;
    const base = resolveBaseUrl(request.headers.host ? `${request.protocol}://${String(request.headers.host)}` : "");

    const session = await stripeClient().checkout.sessions.create({
      mode: selection.mode,
      line_items: [{ price: selection.price, quantity: 1 }],
      managed_payments: { enabled: true },
      client_reference_id: orgId,
      metadata: { orgId, product: body.data.product },
      ...(selection.mode === "subscription" ? { subscription_data: { metadata: { orgId } } } : {}),
      success_url: `${base}/settings?checkout=success`,
      cancel_url: `${base}/settings?checkout=cancelled`,
    });

    if (!session.url) {
      reply.code(502).send({ error: "checkout_unavailable" });
      return;
    }
    reply.send({ url: session.url });
  });

  // The webhook needs the raw request bytes for signature verification, but
  // the app parses JSON globally. Registering the webhook inside its own
  // encapsulated context lets it swap in a raw-buffer parser for just this
  // route without affecting the checkout route above or anything else.
  await app.register(async (webhookApp) => {
    webhookApp.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
      done(null, body);
    });

    webhookApp.post("/api/billing/webhook", async (request, reply) => {
      const sig = request.headers["stripe-signature"];
      if (typeof sig !== "string") {
        reply.code(400).send({ error: "missing_signature" });
        return;
      }
      let event: Stripe.Event;
      try {
        event = stripeClient().webhooks.constructEvent(request.body as Buffer, sig, config.stripe.webhookSecret);
      } catch {
        // Bad signature (or malformed payload) — never trust it.
        reply.code(400).send({ error: "invalid_signature" });
        return;
      }

      try {
        await handleStripeEvent(event);
      } catch (err) {
        // Let Stripe retry (it will, until a 2xx) rather than swallow a
        // transient failure. Idempotency on the domain-object id makes the
        // retry safe.
        request.log.error({ err, eventType: event.type }, "stripe webhook handler failed");
        reply.code(500).send({ error: "handler_failed" });
        return;
      }
      reply.send({ received: true });
    });
  });
}

// Route one verified event to Layer A. Unhandled types return normally (200)
// so Stripe doesn't mark them failed and retry forever.
async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    // A completed one-time purchase. Only the pass goes through Checkout in
    // `payment` mode; subscriptions are handled via invoice.paid below, so a
    // subscription-mode session is deliberately ignored here (handling it too
    // would double-apply the first period). Keyed on the session id so a
    // retry — or the async-payment pair — can't grant twice.
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      if (session.mode !== "payment") return;
      if (session.payment_status !== "paid") return; // async: wait for the succeeded event
      const orgId = session.client_reference_id ?? session.metadata?.orgId;
      if (!orgId) return;
      await recordPassPurchase(orgId, session.id, {
        amountCents: session.amount_total ?? undefined,
        currency: session.currency ?? undefined,
      });
      return;
    }

    // Every subscription payment — the initial invoice and every renewal.
    // Keyed on the invoice id (distinct per period). The subscription object
    // is the authoritative source of the paid-through date and the interval.
    case "invoice.paid": {
      const invoice = event.data.object;
      const subId = extractSubscriptionId(invoice);
      if (!subId) return; // a non-subscription invoice — not ours
      const sub = await stripeClient().subscriptions.retrieve(subId);
      const orgId = sub.metadata?.orgId;
      if (!orgId) return;
      const periodEndSec = extractCurrentPeriodEnd(sub);
      if (!periodEndSec) return;
      const item = sub.items.data[0];
      const recurring = item?.price.recurring;
      const months = recurring ? intervalToMonths(recurring.interval, recurring.interval_count) : 1;
      await applySubscriptionPayment(
        orgId,
        invoice.id ?? `${subId}:${periodEndSec}`,
        new Date(periodEndSec * 1000),
        months,
        {
          amountCents: invoice.amount_paid ?? undefined,
          currency: invoice.currency ?? undefined,
        },
      );
      return;
    }

    // The subscription ended. Recorded, not revoked (Layer A) — the
    // paid-through expiry still governs.
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const orgId = sub.metadata?.orgId;
      if (!orgId) return;
      await recordSubscriptionCancellation(orgId, `${event.id}`);
      return;
    }

    default:
      return; // unhandled → 200, no retry
  }
}

// The subscription link on an invoice, read defensively: the field has moved
// across recent API versions (top-level `subscription` vs. the newer
// `parent.subscription_details.subscription`), so check both.
function extractSubscriptionId(invoice: Stripe.Invoice): string | null {
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
function extractCurrentPeriodEnd(sub: Stripe.Subscription): number | null {
  const s = sub as unknown as {
    current_period_end?: number | null;
    items?: { data?: Array<{ current_period_end?: number | null }> } | null;
  };
  return s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? null;
}
