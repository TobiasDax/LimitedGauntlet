import { Link } from "react-router-dom";
import { useMe } from "../../features/auth/useAuth";
import { useAppConfig } from "../../features/config/useAppConfig";
import {
  useBillingPrices,
  useStartCheckout,
  type BillingPrice,
  type BillingProduct,
} from "../../features/billing/useBilling";
import { Button, Card, FormError } from "../ui";

// HI-9 — the hosted instance's plan + upgrade surface. Renders only when
// entitlements are enforced (hosted); on self-hosted `me.entitlement.enforced`
// is false and this returns null, so a self-hoster never sees a price or a
// paywall. Price figures come live from Stripe (never hardcoded here).

const PRODUCT_LABEL: Record<BillingProduct, string> = {
  pass: "Tournament pass",
  subscription_monthly: "Series — monthly",
  subscription_annual: "Series — annual",
};

const PRODUCT_BLURB: Record<BillingProduct, string> = {
  pass: "One more tournament, unlimited pods.",
  subscription_monthly: "Unlimited tournaments while active.",
  subscription_annual: "Unlimited tournaments while active.",
};

const PRODUCT_ORDER: Record<BillingProduct, number> = {
  pass: 0,
  subscription_monthly: 1,
  subscription_annual: 2,
};

// Minor unit → display. Assumes a 2-decimal currency (our prices are EUR);
// falls back to a plain string if the runtime can't format the code.
function formatMoney(minor: number, currency: string): string {
  const code = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${code}`;
  }
}

function priceLine(p: BillingPrice): string {
  const base = formatMoney(p.unitAmount, p.currency);
  const suffix = p.interval === "month" ? "/mo" : p.interval === "year" ? "/yr" : "";
  return `${base}${suffix} + tax`;
}

export function BillingSection() {
  const { data: me } = useMe();
  const { data: appConfig } = useAppConfig();
  const supportEmail = appConfig?.supportEmail ?? null;
  const ent = me?.entitlement;
  const isSeries = ent?.tier === "SERIES";
  const prices = useBillingPrices(!!ent?.enforced && !isSeries);
  const checkout = useStartCheckout();

  if (!ent?.enforced) return null;

  const planLabel = isSeries
    ? ent.subscriptionExpiresAt
      ? "Series subscription"
      : "Series"
    : ent.tier === "TOURNAMENT_PASS"
      ? "Tournament pass"
      : "Free";
  const activeUntil = ent.subscriptionExpiresAt ? new Date(ent.subscriptionExpiresAt) : null;
  const sorted = [...(prices.data?.prices ?? [])].sort((a, b) => PRODUCT_ORDER[a.product] - PRODUCT_ORDER[b.product]);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs tracking-wide text-ink-muted uppercase">Current plan</span>
        <span className="text-base font-semibold text-ink">{planLabel}</span>
        {isSeries && activeUntil && (
          <span className="text-sm text-ink-muted">· active until {activeUntil.toLocaleDateString()}</span>
        )}
      </div>

      {isSeries && !activeUntil ? (
        <p className="mt-3 text-sm text-ink-muted">
          Unlimited tournaments and pods — this organization has a complimentary Series plan, so there is nothing to
          manage or renew.
        </p>
      ) : isSeries ? (
        <div className="mt-3 flex flex-col gap-2 text-sm text-ink-muted">
          <p>
            Unlimited tournaments while your subscription is active. Cancelling keeps access until{" "}
            {activeUntil!.toLocaleDateString()}.
          </p>
          <p>
            <a href="https://app.link.com" target="_blank" rel="noreferrer" className="text-accent underline">
              Manage your subscription on Link
            </a>{" "}
            — view orders, cancel, or update your payment method. Sign in with the email address you used at checkout;
            if you paid as a guest, create a Link account with that same email.
          </p>
          {supportEmail && (
            <p className="text-ink-muted">
              Trouble signing in? Email{" "}
              <a href={`mailto:${supportEmail}`} className="text-accent underline">
                {supportEmail}
              </a>{" "}
              and we'll sort it out.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <p className="mb-3 text-sm text-ink-muted">
            Upgrade to run more tournaments. A one-time pass covers a single tournament; a Series subscription unlocks
            unlimited tournaments while it's active.
          </p>

          {prices.isLoading && <p className="text-sm text-ink-muted">Loading plans…</p>}
          {prices.isError && <FormError>Couldn't load plans right now — try again shortly.</FormError>}

          <div className="flex flex-col gap-2">
            {sorted.map((p) => (
              <div
                key={p.product}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-bg px-4 py-3"
              >
                <div>
                  <div className="text-md font-semibold text-ink">{PRODUCT_LABEL[p.product]}</div>
                  <div className="text-xs text-ink-muted">{PRODUCT_BLURB[p.product]}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-ink-muted">{priceLine(p)}</span>
                  <Button variant="primary" disabled={checkout.isPending} onClick={() => checkout.mutate(p.product)}>
                    {checkout.isPending ? "Redirecting…" : p.product === "pass" ? "Buy pass" : "Subscribe"}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {checkout.isError && <FormError>Couldn't start checkout — try again.</FormError>}
          <p className="mt-3 text-xs text-ink-muted">
            Payments are handled by Link (Stripe) as merchant of record; applicable tax is added at checkout. By buying
            you agree to the{" "}
            <Link to="/terms" className="text-accent underline">
              Terms of Service
            </Link>
            , including the refund policy.
          </p>
        </div>
      )}
    </Card>
  );
}
