import { describe, expect, it, vi } from "vitest";
import { getPendingCheckout } from "./checkout-session.server";

const slot = {
  attempt_id: "attempt-1",
  customer_id: "cus_fixture",
  price_id: "price_original",
  return_url: "https://flux.example/checkout/return",
  expires_at: 2000000000,
};
const pending = {
  id: "cs_fixture",
  status: "open",
  mode: "subscription",
  livemode: false,
  metadata: { userId: "owner" },
  client_secret: "fixture-secret",
};
async function* asPages<T>(values: T[]) {
  yield* values;
}

function fixture() {
  const reserve = vi.fn().mockResolvedValue({ data: slot, error: null });
  const create = vi.fn().mockResolvedValue(pending);
  const retrieve = vi.fn().mockResolvedValue(pending);
  const list = vi.fn(() => asPages<typeof pending>([]));
  const subscriptions = vi.fn(() => asPages<{ status: string }>([]));
  const stripe = {
    subscriptions: { list: subscriptions },
    checkout: { sessions: { create, retrieve, list } },
  };
  const run = (price = "price_new") =>
    getPendingCheckout(
      stripe as unknown as Parameters<typeof getPendingCheckout>[0],
      "owner",
      "sandbox",
      price,
      "cus_fixture",
      "https://flux.example/return",
      { rpc: reserve } as unknown as NonNullable<Parameters<typeof getPendingCheckout>[6]>,
    );
  return { run, reserve, create, retrieve, list, subscriptions };
}

describe("pending SaaS checkout", () => {
  it("reuses the same Stripe idempotency key and original request across concurrent calls", async () => {
    const { run, create } = fixture();
    expect(await Promise.all([run(), run("price_other")])).toEqual([
      "fixture-secret",
      "fixture-secret",
    ]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: slot.price_id, quantity: 1 }],
        expires_at: slot.expires_at,
      }),
      { idempotencyKey: slot.attempt_id },
    );
  });

  it("returns an open session and blocks a subscription that has not reached the webhook", async () => {
    const { run, list, create, subscriptions } = fixture();
    list.mockImplementation(() => asPages([pending]));
    await expect(run()).resolves.toBe("fixture-secret");
    expect(create).not.toHaveBeenCalled();
    subscriptions.mockImplementation(() => asPages([{ status: "incomplete" }]));
    await expect(run()).rejects.toThrow("assinatura ou pagamento");
    expect(create).not.toHaveBeenCalled();
  });

  it("does not return an idempotent response for a completed checkout", async () => {
    const { run, retrieve } = fixture();
    retrieve.mockResolvedValue({ ...pending, status: "complete" });
    await expect(run()).rejects.toThrow("encerrado");
  });
});
