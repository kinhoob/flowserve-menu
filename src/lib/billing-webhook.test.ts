import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, verify } = vi.hoisted(() => ({ rpc: vi.fn(), verify: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
vi.mock("./stripe.server", () => ({ verifyWebhook: verify }));
import { processBillingWebhook } from "./billing-webhook";
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ error: null });
});
const event = {
  id: "evt_1",
  created: 123,
  livemode: true,
  type: "customer.subscription.updated",
  data: {
    object: {
      id: "sub_1",
      metadata: { userId: "user_1" },
      customer: "cus_1",
      status: "active",
      items: { data: [{ price: { lookup_key: "pro_monthly", product: "prod_1" } }] },
    },
  },
};
describe("billing webhook", () => {
  it("propagates a database failure so Stripe can retry", async () => {
    verify.mockResolvedValue(event);
    rpc.mockResolvedValue({ error: new Error("database offline") });
    await expect(
      processBillingWebhook(new Request("https://flux.example"), "live"),
    ).rejects.toThrow("database offline");
  });
  it("passes deduplication and ordering identity to one atomic database call", async () => {
    verify.mockResolvedValue(event);
    await processBillingWebhook(new Request("https://flux.example"), "live");
    expect(rpc).toHaveBeenCalledWith(
      "apply_billing_event",
      expect.objectContaining({ p_event_id: "evt_1", p_created: 123, p_environment: "live" }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects an active subscription without an allowlisted plan", async () => {
    verify.mockResolvedValue({
      ...event,
      data: {
        object: { ...event.data.object, items: { data: [{ price: { lookup_key: "unrelated" } }] } },
      },
    });
    await expect(
      processBillingWebhook(new Request("https://flux.example"), "live"),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
