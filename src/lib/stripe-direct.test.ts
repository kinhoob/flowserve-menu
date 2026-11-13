import { afterEach, describe, expect, it, vi } from "vitest";
import { createStripeClient } from "./stripe.server";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("direct Stripe integration", () => {
  it("calls Stripe directly with the selected secret and no connector headers", async () => {
    vi.stubEnv("STRIPE_SANDBOX_SECRET_KEY", "sk_test_flux");
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "cus_test", object: "customer" }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    await createStripeClient("sandbox").customers.retrieve("cus_test");
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://api.stripe.com/v1/customers/cus_test");
    const headers = new Headers(options.headers);
    expect(headers.get("authorization")).toBe("Bearer sk_test_flux");
    expect(headers.has("Lovable-API-Key")).toBe(false);
    expect(headers.has("X-Connection-Api-Key")).toBe(false);
  });
  it("rejects a live key configured in sandbox", () => {
    vi.stubEnv("STRIPE_SANDBOX_SECRET_KEY", "sk_live_wrong");
    expect(() => createStripeClient("sandbox")).toThrow("incompatível");
  });
});
