import { afterEach, describe, expect, it, vi } from "vitest";
import {
  matchesPlanPrice,
  validateEnvironment,
  validatePlanPrice,
  validateReturnUrl,
} from "./payment-policy";
afterEach(() => vi.unstubAllEnvs());
describe("payment trust boundaries", () => {
  it("accepts only configured plans", () => {
    expect(validatePlanPrice("pro_monthly")).toBe("pro_monthly");
    expect(() => validatePlanPrice("price_unrelated")).toThrow();
  });
  it("requires the exact amount, currency, interval and Stripe environment", () => {
    const price = {
      lookup_key: "essential_monthly",
      active: true,
      livemode: true,
      currency: "brl",
      unit_amount: 9900,
      recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    };
    expect(matchesPlanPrice(price, "essential_monthly", "live")).toBe(true);
    expect(matchesPlanPrice(price, "essential_monthly", "sandbox")).toBe(false);
    expect(matchesPlanPrice({ ...price, unit_amount: 100 }, "essential_monthly", "live")).toBe(
      false,
    );
    expect(
      matchesPlanPrice(
        { ...price, recurring: { ...price.recurring, interval_count: 12 } },
        "essential_monthly",
        "live",
      ),
    ).toBe(false);
  });
  it("rejects client-selected sandbox on a live server", () => {
    vi.stubEnv("PAYMENTS_ENVIRONMENT", "live");
    vi.stubEnv("APP_URL", "https://flux.example");
    expect(() => validateEnvironment("sandbox")).toThrow();
    expect(validateEnvironment("live")).toBe("live");
    expect(() => validateEnvironment("unknown")).toThrow();
  });
  it("requires an explicit payment environment and a configured HTTPS live origin", () => {
    vi.stubEnv("PAYMENTS_ENVIRONMENT", undefined);
    expect(() => validateEnvironment("live")).toThrow("PAYMENTS_ENVIRONMENT");
    expect(() => validateReturnUrl(undefined, "https://flux.example")).toThrow(
      "PAYMENTS_ENVIRONMENT",
    );
    vi.stubEnv("PAYMENTS_ENVIRONMENT", "live");
    for (const url of [
      undefined,
      "http://flux.example",
      "https://user@flux.example",
      "https://flux.example/admin",
    ]) {
      vi.stubEnv("APP_URL", url);
      expect(() => validateEnvironment("live")).toThrow("APP_URL");
      expect(() => validateReturnUrl(undefined, "https://flux.example")).toThrow("APP_URL");
    }
    vi.stubEnv("APP_URL", "https://flux.example");
    expect(validateEnvironment("live")).toBe("live");
  });
  it("allows sandbox only when explicitly configured", () => {
    vi.stubEnv("PAYMENTS_ENVIRONMENT", "sandbox");
    expect(validateEnvironment("sandbox")).toBe("sandbox");
  });
  it("prevents return URL redirection to another host", () => {
    vi.stubEnv("PAYMENTS_ENVIRONMENT", "sandbox");
    vi.stubEnv("APP_URL", "https://flux.example");
    expect(() => validateReturnUrl("https://evil.example", "https://flux.example")).toThrow();
    expect(() =>
      validateReturnUrl("https://attacker@flux.example", "https://flux.example"),
    ).toThrow();
    expect(
      validateReturnUrl(
        "/checkout/return?session_id={CHECKOUT_SESSION_ID}",
        "https://flux.example",
      ),
    ).toContain("https://flux.example/checkout/return");
  });
});
