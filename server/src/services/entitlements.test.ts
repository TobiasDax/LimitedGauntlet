import { afterEach, describe, expect, it } from "vitest";
import { config } from "../config.js";
import type { EntitlementTier } from "../db.js";
import { CAPABILITIES, can, isEntitlementEnforcementActive } from "./entitlements.js";

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
