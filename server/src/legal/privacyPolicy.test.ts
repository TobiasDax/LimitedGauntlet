import { describe, expect, it } from "vitest";
import { renderLegalDoc, type LegalDocInput } from "./privacyPolicy.js";

function input(overrides: Partial<LegalDocInput> = {}): LegalDocInput {
  return {
    controllerName: "Weekend Gauntlet e.V.",
    controllerAddress: "Musterstraße 1\n12345 Musterstadt",
    controllerEmail: "legal@example.org",
    controllerPhone: "",
    registerInfo: "",
    dpoContact: "",
    lawfulBasis: "legitimate-interest",
    retentionTournaments: "kept as a permanent competitive record",
    retentionLogs: "",
    hostingProvider: "Hetzner Online GmbH, Germany",
    supervisoryAuthority: "LfDI Baden-Württemberg",
    smtpProvider: "",
    analyticsProvider: "",
    lastUpdated: "2026-09-10",
    features: {
      email: false,
      analytics: false,
      sso: [],
      adminWebhook: false,
      requestLogKeepsIp: false,
    },
    ...overrides,
  };
}

describe("renderLegalDoc", () => {
  it("substitutes set fields and always emits Impressum + Privacy Policy", () => {
    const { markdown } = renderLegalDoc(input());
    expect(markdown).toContain("Weekend Gauntlet e.V.");
    expect(markdown).toContain("legal@example.org");
    expect(markdown).toContain("Hetzner Online GmbH, Germany");
    expect(markdown).toContain("## Impressum");
    expect(markdown).toContain("## Privacy Policy");
  });

  it("renders a visible placeholder for an unset field", () => {
    const { markdown } = renderLegalDoc(input({ hostingProvider: "  " }));
    expect(markdown).toContain("**(not configured — set LEGAL_HOSTING_PROVIDER)**");
  });

  it("flags incomplete when the controller name or email is missing", () => {
    expect(renderLegalDoc(input({ controllerName: "" })).incomplete).toBe(true);
    expect(renderLegalDoc(input({ controllerEmail: "   " })).incomplete).toBe(true);
    expect(renderLegalDoc(input()).incomplete).toBe(false);
  });

  it("omits the analytics, SMTP, SSO and operator-webhook sections when those features are off", () => {
    const { markdown } = renderLegalDoc(input());
    expect(markdown).not.toContain("Web analytics");
    expect(markdown).not.toContain("Transactional email");
    expect(markdown).not.toContain("SSO login");
    expect(markdown).not.toContain("Operator notification on signup");
  });

  it("includes the analytics section (with its host) when analytics is on", () => {
    const { markdown } = renderLegalDoc(
      input({ analyticsProvider: "stats.example.org", features: { ...input().features, analytics: true } }),
    );
    expect(markdown).toContain("#### Web analytics");
    expect(markdown).toContain("stats.example.org");
    expect(markdown).toContain("Umami");
  });

  it("includes the SMTP section and processor line when email is configured", () => {
    const { markdown } = renderLegalDoc(
      input({ smtpProvider: "Postmark, USA", features: { ...input().features, email: true } }),
    );
    expect(markdown).toContain("#### Transactional email");
    expect(markdown).toContain("Postmark, USA");
  });

  it("lists SSO providers and adds a US-transfer note only for Google/Discord", () => {
    const withOidc = renderLegalDoc(
      input({ features: { ...input().features, sso: [{ id: "oidc", label: "Pocket ID" }] } }),
    ).markdown;
    expect(withOidc).toContain("Pocket ID");
    expect(withOidc).not.toContain("United States");

    const withGoogle = renderLegalDoc(
      input({ features: { ...input().features, sso: [{ id: "google", label: "Google" }] } }),
    ).markdown;
    expect(withGoogle).toContain("transfer of personal data to the United States");
  });

  it("switches the lawful-basis paragraph", () => {
    expect(renderLegalDoc(input({ lawfulBasis: "legitimate-interest" })).markdown).toContain("Art. 6(1)(f)");
    expect(renderLegalDoc(input({ lawfulBasis: "consent" })).markdown).toContain("Art. 6(1)(a)");
    expect(renderLegalDoc(input({ lawfulBasis: "contract" })).markdown).toContain("Art. 6(1)(b) GDPR — performance");
  });

  it("describes the log posture from requestLogKeepsIp", () => {
    const minimal = renderLegalDoc(input()).markdown;
    expect(minimal).toContain("not** to record the visitor IP");

    const full = renderLegalDoc(
      input({ retentionLogs: "30 days", features: { ...input().features, requestLogKeepsIp: true } }),
    ).markdown;
    expect(full).toContain("30 days");
    expect(full).not.toContain("not** to record the visitor IP");
  });

  it("renders the optional DPO and phone lines only when set", () => {
    const bare = renderLegalDoc(input()).markdown;
    expect(bare).not.toContain("Data protection officer");
    expect(bare).not.toContain("Phone:");

    const filled = renderLegalDoc(input({ dpoContact: "dpo@example.org", controllerPhone: "+49 30 000000" })).markdown;
    expect(filled).toContain("Data protection officer:** dpo@example.org");
    expect(filled).toContain("Phone: +49 30 000000");
  });
});
