import { beforeEach, describe, expect, it, vi } from "vitest";
import { processBillingWebhook } from "./billing-webhook";
const { rpc, verify, retrieve } = vi.hoisted(() => ({
  rpc: vi.fn(),
  verify: vi.fn(),
  retrieve: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
vi.mock("./stripe.server", () => ({
  verifyWebhook: verify,
  createStripeClient: () => ({ subscriptions: { retrieve } }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockImplementation(async (name) =>
    name === "begin_billing_reconciliation" ? { data: "7", error: null } : { error: null },
  );
  retrieve.mockResolvedValue({ ...event.data.object, livemode: true });
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
  it("passes deduplication and ordering identity to a database generation acquired before retrieval", async () => {
    verify.mockResolvedValue(event);
    await processBillingWebhook(new Request("https://flux.example"), "live");
    expect(rpc).toHaveBeenCalledWith(
      "apply_billing_event",
      expect.objectContaining({ p_event_id: "evt_1", p_created: 123, p_environment: "live" }),
    );
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "begin_billing_reconciliation", {
      p_environment: "live",
      p_subscription_id: "sub_1",
    });
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(retrieve.mock.invocationCallOrder[0]);
  });
  it("reconciles an invoice with the latest subscription instead of the event payload", async () => {
    verify.mockResolvedValue({
      ...event,
      type: "invoice.payment_failed",
      data: { object: { parent: { subscription_details: { subscription: "sub_1" } } } },
    });
    retrieve.mockResolvedValue({ ...event.data.object, livemode: true, status: "past_due" });
    await processBillingWebhook(new Request("https://flux.example"), "live");
    expect(retrieve).toHaveBeenCalledWith("sub_1");
    expect(rpc).toHaveBeenCalledWith(
      "apply_billing_event",
      expect.objectContaining({
        p_subscription: expect.objectContaining({
          status: "past_due",
          reconciliation_generation: "7",
        }),
      }),
    );
  });
  it("reconciles sandbox cancellation after an invoice using the same generation protocol", async () => {
    verify.mockResolvedValue({ ...event, livemode: false, type: "customer.subscription.deleted" });
    retrieve.mockResolvedValue({ ...event.data.object, livemode: false, status: "canceled" });
    await processBillingWebhook(new Request("http://localhost"), "sandbox");
    expect(rpc).toHaveBeenNthCalledWith(1, "begin_billing_reconciliation", {
      p_environment: "sandbox",
      p_subscription_id: "sub_1",
    });
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "apply_billing_event",
      expect.objectContaining({
        p_environment: "sandbox",
        p_subscription: expect.objectContaining({
          status: "canceled",
          reconciliation_generation: "7",
        }),
      }),
    );
  });
  it("rejects an active subscription without an allowlisted plan", async () => {
    verify.mockResolvedValue(event);
    retrieve.mockResolvedValue({
      ...event.data.object,
      livemode: true,
      items: { data: [{ price: { lookup_key: "unrelated" } }] },
    });
    await expect(
      processBillingWebhook(new Request("https://flux.example"), "live"),
    ).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
