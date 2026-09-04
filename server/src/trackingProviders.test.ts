import { describe, expect, it } from "vitest";
import { parseTrackingConfig } from "./trackingProviders.js";

describe("parseTrackingConfig", () => {
  it("is inert when TRACKING_PROVIDER is unset", () => {
    expect(parseTrackingConfig({})).toBeNull();
    expect(parseTrackingConfig({ provider: "  " })).toBeNull();
  });

  it("accepts a valid Umami config", () => {
    expect(
      parseTrackingConfig({
        provider: "umami",
        scriptUrl: "https://analytics.example.com/script.js",
        code: "3d9f1e2a-7b4c-4a1d-9e6f-2c8b1a0d5f3e",
      }),
    ).toEqual({
      provider: "umami",
      scriptUrl: "https://analytics.example.com/script.js",
      code: "3d9f1e2a-7b4c-4a1d-9e6f-2c8b1a0d5f3e",
    });
  });

  it("rejects an unknown provider", () => {
    expect(() =>
      parseTrackingConfig({ provider: "google-analytics", scriptUrl: "https://x.example.com/s.js", code: "x" }),
    ).toThrow(/TRACKING_PROVIDER/);
  });

  it.each(["", "not-a-url", "ftp://analytics.example.com/script.js", "javascript:alert(1)", "data:text/html,x"])(
    "rejects a malformed or non-https TRACKING_SCRIPT_URL %s",
    (scriptUrl) => {
      expect(() =>
        parseTrackingConfig({
          provider: "umami",
          scriptUrl,
          code: "3d9f1e2a-7b4c-4a1d-9e6f-2c8b1a0d5f3e",
        }),
      ).toThrow(/TRACKING_SCRIPT_URL/);
    },
  );

  it.each(["", "not-a-uuid", "<script>alert(1)</script>", "3d9f1e2a-7b4c-4a1d-9e6f"])(
    "rejects a TRACKING_CODE that doesn't match the provider's pattern %s",
    (code) => {
      expect(() =>
        parseTrackingConfig({ provider: "umami", scriptUrl: "https://analytics.example.com/script.js", code }),
      ).toThrow(/TRACKING_CODE/);
    },
  );
});
