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
    expect(() => validateEnvironment("sandbox")).toThrow();
    expect(validateEnvironment("live")).toBe("live");
    expect(() => validateEnvironment("unknown")).toThrow();
  });
  it("allows sandbox only when explicitly configured", () => {
    vi.stubEnv("PAYMENTS_ENVIRONMENT", "sandbox");
    expect(validateEnvironment("sandbox")).toBe("sandbox");
  });
  it("prevents return URL redirection to another host", () => {
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
