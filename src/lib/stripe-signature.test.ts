import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhook } from "./stripe.server";
afterEach(() => vi.unstubAllEnvs());
function signed(options: { timestamp?: string; tamper?: boolean; live?: boolean } = {}) {
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    id: "evt_test",
    created: 123,
    livemode: options.live ?? true,
    type: "test",
    data: { object: {} },
  });
  const signature = createHmac("sha256", "test-secret")
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return new Request("https://flux.example", {
    method: "POST",
    body: options.tamper ? body + " " : body,
    headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
  });
}
describe("Stripe webhook verification", () => {
  it("accepts a valid signed event", async () => {
    vi.stubEnv("PAYMENTS_LIVE_WEBHOOK_SECRET", "test-secret");
    expect((await verifyWebhook(signed(), "live")).id).toBe("evt_test");
  });
  it("rejects a modified body", async () => {
    vi.stubEnv("PAYMENTS_LIVE_WEBHOOK_SECRET", "test-secret");
    await expect(verifyWebhook(signed({ tamper: true }), "live")).rejects.toThrow();
  });
  it("rejects expired or nonnumeric timestamps", async () => {
    vi.stubEnv("PAYMENTS_LIVE_WEBHOOK_SECRET", "test-secret");
    await expect(verifyWebhook(signed({ timestamp: "1" }), "live")).rejects.toThrow();
    await expect(verifyWebhook(signed({ timestamp: "NaN" }), "live")).rejects.toThrow();
  });
  it("rejects an event from a different environment", async () => {
    vi.stubEnv("PAYMENTS_LIVE_WEBHOOK_SECRET", "test-secret");
    await expect(verifyWebhook(signed({ live: false }), "live")).rejects.toThrow();
  });
});
