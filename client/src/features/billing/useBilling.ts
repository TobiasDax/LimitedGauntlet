import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

// HI-9 — the hosted instance's paid plans. These hooks only do anything on a
// hosted (entitlements-enforced) deployment; on self-hosted the routes don't
// exist and the UI that calls them never renders.
export type BillingProduct = "pass" | "subscription_monthly" | "subscription_annual";

export interface BillingPrice {
  product: BillingProduct;
  // Tax-exclusive base amount in the currency's minor unit (e.g. cents).
  // Stripe (as Merchant of Record) adds indirect tax at checkout.
  unitAmount: number;
  currency: string;
  // Recurring interval, or null for the one-time pass.
  interval: "day" | "week" | "month" | "year" | null;
}

// Live price figures from Stripe (never hardcoded in the repo). `enabled` so
// this never fires on self-hosted or for an org-less identity.
export function useBillingPrices(enabled: boolean) {
  return useQuery<{ prices: BillingPrice[] }>({
    queryKey: ["billing-prices"],
    queryFn: () => api.get<{ prices: BillingPrice[] }>("/billing/prices"),
    enabled,
    staleTime: 5 * 60_000,
  });
}

// Start a hosted Stripe Checkout and redirect the browser to it. The return
// never resolves to the caller in practice — the page navigates away.
export function useStartCheckout() {
  return useMutation({
    mutationFn: (product: BillingProduct) => api.post<{ url: string }>("/billing/checkout", { product }),
    onSuccess: ({ url }) => {
      if (url) window.location.assign(url);
    },
  });
}
