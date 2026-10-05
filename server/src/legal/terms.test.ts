import { describe, expect, it } from "vitest";
import { renderTerms, TERMS_LAST_UPDATED, type TermsInput } from "./terms.js";

function input(overrides: Partial<TermsInput> = {}): TermsInput {
  return {
    operatorName: "Beispiel GmbH",
    operatorAddress: "Musterstraße 1\n12345 Musterstadt",
    supportEmail: "support@example.org",
    legalPageEnabled: true,
    ...overrides,
  };
}

describe("renderTerms", () => {
  it("fills in the operator identity and contact", () => {
    const { markdown, incomplete } = renderTerms(input());
    expect(incomplete).toBe(false);
    expect(markdown).toContain("Beispiel GmbH");
    expect(markdown).toContain("Musterstraße 1, 12345 Musterstadt");
    expect(markdown).toContain("support@example.org");
    expect(markdown).toContain(TERMS_LAST_UPDATED);
  });

  it("covers the sections a paid service needs: plans, cancellation, refunds, data, liability", () => {
    const { markdown } = renderTerms(input());
    for (const heading of [
      "## 3. Plans",
      "## 4. Subscriptions",
      "## 5. Refunds",
      "## 6. Your data",
      "## 9. Liability",
    ]) {
      expect(markdown).toContain(heading);
    }
    expect(markdown).toContain("https://app.link.com");
  });

  it("never states a price (amounts live in the payment processor)", () => {
    expect(renderTerms(input()).markdown).not.toMatch(/[€$£]\s?\d|\d\s?(€|EUR|USD)/);
  });

  it("flags itself incomplete when the operator name or contact email is missing", () => {
    expect(renderTerms(input({ operatorName: "" })).incomplete).toBe(true);
    expect(renderTerms(input({ supportEmail: "  " })).incomplete).toBe(true);
    expect(renderTerms(input({ operatorName: "" })).markdown).toContain("(not configured — set LEGAL_CONTROLLER_NAME)");
  });

  it("only links /legal when the built-in legal page is enabled", () => {
    expect(renderTerms(input()).markdown).toContain("(/legal)");
    expect(renderTerms(input({ legalPageEnabled: false })).markdown).not.toContain("(/legal)");
  });
});
