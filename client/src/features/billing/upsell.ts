import { ApiError } from "../../lib/api";

// HI-9 — the 402→upsell sweep. Every entitlement refusal the server returns
// (402 `entitlement_required` with a `reason`) is surfaced the same way: a
// single global modal raised by the QueryClient's mutation-error handler, so
// no individual mutation has to know about tiers. Copy is accurate to the
// capability matrix — FREE and a pass share features; only Series unlocks
// capabilities. A pass only changes quantities (an extra tournament, unlimited
// pods in it).

export interface EntitlementRefusal {
  reason: string;
  maxDays?: number;
}

// Parse a thrown error into an entitlement refusal, if it is one.
export function entitlementRefusal(err: unknown): EntitlementRefusal | null {
  if (!(err instanceof ApiError) || err.status !== 402) return null;
  const body = err.body;
  if (!body || typeof body !== "object" || !("reason" in body)) return null;
  const rec = body as Record<string, unknown>;
  const rawMaxDays = rec.maxDays;
  return { reason: String(rec.reason), maxDays: typeof rawMaxDays === "number" ? rawMaxDays : undefined };
}

export function upsellCopy({ reason, maxDays }: EntitlementRefusal): { title: string; body: string } {
  switch (reason) {
    // Quantity limits — a one-time pass or Series both help.
    case "tournament_limit":
      return {
        title: "Add another tournament",
        body: "You've used your organization's free tournament. Add one more with a one-time pass, or subscribe to Series for unlimited tournaments.",
      };
    case "pod_limit":
      return {
        title: "Add another pod",
        body: "The free tournament includes one pod. A one-time pass unlocks unlimited pods for that tournament, or subscribe to Series for unlimited everything.",
      };
    // Capabilities — Series only.
    case "tournament_duration":
      return {
        title: "Run longer tournaments with Series",
        body: `Free and pass tournaments can span at most ${maxDays ?? 7} days. A Series subscription removes the limit.`,
      };
    case "dates_locked":
      return {
        title: "Edit dates with Series",
        body: "Tournament dates are fixed on the free and pass tiers. A Series subscription lets you change them.",
      };
    case "window_closed":
      return {
        title: "Outside your tournament's dates",
        body: "Free and pass tournaments can only run rounds within their dates. A Series subscription removes the window so you can play on any schedule.",
      };
    case "organizer.invite":
      return {
        title: "Co-organizers are a Series feature",
        body: "Inviting co-organizers needs a Series subscription — then others can help run your events.",
      };
    case "webhooks":
      return {
        title: "Webhooks are a Series feature",
        body: "Outgoing webhooks need a Series subscription — notify your own services when rounds and pods change.",
      };
    case "export.bulk":
      return {
        title: "Export is a Series feature",
        body: "Full-organization export needs a Series subscription. (A player's own data export is always available, on every tier.)",
      };
    case "export.excel":
      return {
        title: "Spreadsheet export is a Series feature",
        body: "Excel export needs a Series subscription to download tournament spreadsheets.",
      };
    case "apiTokens":
      return {
        title: "API access is a Series feature",
        body: "API tokens and the MCP server need a Series subscription to enable programmatic access.",
      };
    default:
      return {
        title: "Upgrade your plan",
        body: "This action needs a higher plan on this hosted instance.",
      };
  }
}

// Reasons handled inline by their own form, so the global modal skips them to
// avoid double-surfacing. `free_org_limit` shows a message on the org form;
// `data_expired` is a read (public page), never a mutation, so it never
// reaches the mutation-error handler anyway.
const INLINE_REASONS = new Set(["free_org_limit", "data_expired"]);

// A tiny external store so the mutation-error handler — which runs outside
// React render — can raise the modal, read via useSyncExternalStore.
let current: EntitlementRefusal | null = null;
const listeners = new Set<() => void>();

export function subscribeUpsell(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function getUpsell(): EntitlementRefusal | null {
  return current;
}
export function dismissUpsell(): void {
  current = null;
  for (const l of listeners) l();
}

// The single entry point the QueryClient calls on every mutation error.
export function maybeShowUpsell(err: unknown): void {
  const refusal = entitlementRefusal(err);
  if (!refusal || INLINE_REASONS.has(refusal.reason)) return;
  current = refusal;
  for (const l of listeners) l();
}
