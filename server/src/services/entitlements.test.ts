import { afterEach, describe, expect, it } from "vitest";
import { config } from "../config.js";
import type { EntitlementTier } from "../db.js";
import {
  CAPABILITIES,
  can,
  dataAccessibleUntil,
  effectiveTier,
  type EntitlementState,
  isDataAccessible,
  isEntitlementEnforcementActive,
  isSubscriptionActive,
  isWithinDurationLimit,
  maxTournamentDays,
} from "./entitlements.js";

const TIERS: readonly EntitlementTier[] = ["FREE", "TOURNAMENT_PASS", "SERIES"];

// Enforcement is off by default everywhere (that *is* the default posture);
// tests that need it on flip it explicitly and this puts it back.
afterEach(() => {
  config.hostedEntitlements.enforced = false;
});

describe("entitlement enforcement flag", () => {
  // The regression test this whole module exists for. If someone later adds a
  // capability check that reads `organization.entitlementTier` directly
  // instead of going through `can()`, self-hosted deployments start losing
  // features — silently, because the flag they never set stops protecting
  // them. Asserting the full matrix here means that mistake has to walk past
  // a failing test with an explanation attached.
  it("allows every capability on every tier when enforcement is off", () => {
    config.hostedEntitlements.enforced = false;

    for (const tier of TIERS) {
      for (const capability of CAPABILITIES) {
        expect(can(tier, capability), `${tier} should keep ${capability} when unenforced`).toBe(true);
      }
    }
  });

  it("reports whether enforcement is active", () => {
    config.hostedEntitlements.enforced = false;
    expect(isEntitlementEnforcementActive()).toBe(false);

    config.hostedEntitlements.enforced = true;
    expect(isEntitlementEnforcementActive()).toBe(true);
  });

  it("defaults to off, so a deployment that sets nothing is unrestricted", () => {
    // HOSTED_ENTITLEMENTS is unset in the test environment, exactly as it is
    // in a fresh self-hosted deployment.
    expect(process.env.HOSTED_ENTITLEMENTS).toBeUndefined();
  });
});

describe("tier capabilities under enforcement", () => {
  it("gives a SERIES subscription every capability", () => {
    config.hostedEntitlements.enforced = true;

    for (const capability of CAPABILITIES) {
      expect(can("SERIES", capability), `SERIES should have ${capability}`).toBe(true);
    }
  });

  it("withholds every gated capability from FREE", () => {
    config.hostedEntitlements.enforced = true;

    for (const capability of CAPABILITIES) {
      expect(can("FREE", capability), `FREE should not have ${capability}`).toBe(false);
    }
  });

  // A pass buys quantity, not features: unlimited pods within the tournament
  // it covers, but the same feature set as free. If these ever diverge it
  // should be a deliberate product decision, not drift.
  it("gives TOURNAMENT_PASS the same capabilities as FREE", () => {
    config.hostedEntitlements.enforced = true;

    for (const capability of CAPABILITIES) {
      expect(can("TOURNAMENT_PASS", capability), `TOURNAMENT_PASS vs FREE: ${capability}`).toBe(
        can("FREE", capability),
      );
    }
  });
});

const NOW = new Date("2026-06-15T12:00:00.000Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const days = (n: number) => new Date(NOW.getTime() + n * MS_PER_DAY);

function state(overrides: Partial<EntitlementState> = {}): EntitlementState {
  return {
    tier: "FREE",
    subscriptionExpiresAt: null,
    cumulativePaidMonths: 0,
    retentionOverrideUntil: null,
    freeTournamentUsed: false,
    ...overrides,
  };
}

describe("isSubscriptionActive", () => {
  // The operator-comp shape. Reading null as "expired" would silently revoke
  // access from exactly the people who were given it as a favour.
  it("treats a SERIES org with no expiry as a perpetual grant", () => {
    expect(isSubscriptionActive(state({ tier: "SERIES", subscriptionExpiresAt: null }), NOW)).toBe(true);
  });

  it("is active until the expiry passes", () => {
    expect(isSubscriptionActive(state({ tier: "SERIES", subscriptionExpiresAt: days(1) }), NOW)).toBe(true);
    expect(isSubscriptionActive(state({ tier: "SERIES", subscriptionExpiresAt: days(-1) }), NOW)).toBe(false);
  });

  it("is never active on a tier that has no subscription", () => {
    expect(isSubscriptionActive(state({ tier: "FREE", subscriptionExpiresAt: null }), NOW)).toBe(false);
    expect(isSubscriptionActive(state({ tier: "TOURNAMENT_PASS" }), NOW)).toBe(false);
  });
});

describe("effectiveTier", () => {
  it("drops a lapsed subscription back to FREE", () => {
    expect(effectiveTier(state({ tier: "SERIES", subscriptionExpiresAt: days(-1) }), NOW)).toBe("FREE");
  });

  it("keeps an active subscription at SERIES", () => {
    expect(effectiveTier(state({ tier: "SERIES", subscriptionExpiresAt: days(30) }), NOW)).toBe("SERIES");
  });
});

describe("dataAccessibleUntil", () => {
  it("gives a subscribed org no deadline at all", () => {
    const until = dataAccessibleUntil(state({ tier: "SERIES", subscriptionExpiresAt: days(30) }), days(-400), NOW);
    expect(until).toBeNull();
  });

  // Cumulative and uncapped: pay for two years, keep the data two years.
  it("keeps a lapsed subscription's data for every month ever paid", () => {
    const lapsed = days(-10);
    const until = dataAccessibleUntil(
      state({ tier: "SERIES", subscriptionExpiresAt: lapsed, cumulativePaidMonths: 24 }),
      days(-100),
      NOW,
    );

    // Two years past the lapse, not past the last tournament.
    expect(until!.getFullYear()).toBe(lapsed.getFullYear() + 2);
  });

  it("keeps an unsubscribed org's data a month past its last tournament", () => {
    const lastEnd = new Date("2026-06-01T00:00:00.000Z");
    const until = dataAccessibleUntil(state(), lastEnd, NOW);
    expect(until!.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("has no deadline when the org has never run a tournament", () => {
    expect(dataAccessibleUntil(state(), null, NOW)).toBeNull();
  });

  it("lets an operator retention grant extend past the earned deadline", () => {
    const until = dataAccessibleUntil(state({ retentionOverrideUntil: days(400) }), days(-5), NOW);
    expect(until!.toISOString()).toBe(days(400).toISOString());
  });

  it("ignores a retention grant that falls short of the earned deadline", () => {
    const lastEnd = new Date("2026-06-01T00:00:00.000Z");
    const until = dataAccessibleUntil(state({ retentionOverrideUntil: days(-200) }), lastEnd, NOW);
    expect(until!.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("applies a retention grant even to an org with no tournaments", () => {
    const until = dataAccessibleUntil(state({ retentionOverrideUntil: days(30) }), null, NOW);
    expect(until!.toISOString()).toBe(days(30).toISOString());
  });
});

describe("isDataAccessible", () => {
  it("never locks anything when enforcement is off", () => {
    config.hostedEntitlements.enforced = false;
    // A deadline two years in the past would lock this org if enforced.
    expect(isDataAccessible(state(), days(-800), NOW)).toBe(true);
  });

  it("locks an unsubscribed org once the month has run out", () => {
    config.hostedEntitlements.enforced = true;
    expect(isDataAccessible(state(), days(-20), NOW)).toBe(true);
    expect(isDataAccessible(state(), days(-40), NOW)).toBe(false);
  });

  it("keeps a subscribed org readable regardless of tournament age", () => {
    config.hostedEntitlements.enforced = true;
    expect(isDataAccessible(state({ tier: "SERIES", subscriptionExpiresAt: days(1) }), days(-5000), NOW)).toBe(true);
  });
});

describe("tournament duration limits", () => {
  it("is unrestricted when enforcement is off", () => {
    config.hostedEntitlements.enforced = false;
    expect(maxTournamentDays(state(), NOW)).toBeNull();
    expect(isWithinDurationLimit(state(), NOW, days(90), NOW)).toBe(true);
  });

  it("is unrestricted for an active subscription", () => {
    config.hostedEntitlements.enforced = true;
    expect(maxTournamentDays(state({ tier: "SERIES", subscriptionExpiresAt: days(5) }), NOW)).toBeNull();
  });

  it("caps an unsubscribed org at seven days", () => {
    config.hostedEntitlements.enforced = true;
    expect(maxTournamentDays(state(), NOW)).toBe(7);
    expect(isWithinDurationLimit(state(), NOW, days(7), NOW)).toBe(true);
    expect(isWithinDurationLimit(state(), NOW, days(8), NOW)).toBe(false);
  });

  it("caps a lapsed subscription the same as any unsubscribed org", () => {
    config.hostedEntitlements.enforced = true;
    const lapsed = state({ tier: "SERIES", subscriptionExpiresAt: days(-1) });
    expect(isWithinDurationLimit(lapsed, NOW, days(8), NOW)).toBe(false);
  });
});
