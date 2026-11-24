import { describe, expect, it, vi } from "vitest";
import { getPendingCheckout } from "./checkout-session.server";

const slot = {
  attempt_id: "attempt-1",
  customer_id: "cus_fixture",
  price_id: "price_pro",
  return_url: "https://flux.example/checkout/return",
  expires_at: 2000000000,
};
const pending = {
  id: "cs_fixture",
  status: "open",
  mode: "subscription",
  livemode: false,
  customer: "cus_fixture",
  metadata: { userId: "owner" },
  line_items: {
    has_more: false,
    data: [{ quantity: 1, price: { id: "price_pro", lookup_key: "pro_monthly" } }],
  },
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
  const price = vi.fn().mockResolvedValue({ lookup_key: "pro_monthly" });
  const stripe = {
    prices: { retrieve: price },
    subscriptions: { list: subscriptions },
    checkout: { sessions: { create, retrieve, list } },
  };
  const run = (price = "price_pro") =>
    getPendingCheckout(
      stripe as unknown as Parameters<typeof getPendingCheckout>[0],
      "owner",
      "sandbox",
      price,
      "cus_fixture",
      "https://flux.example/return",
      { rpc: reserve } as unknown as NonNullable<Parameters<typeof getPendingCheckout>[6]>,
    );
  return { run, reserve, create, retrieve, list, subscriptions, price };
}

describe("pending SaaS checkout", () => {
  it("reuses the same Stripe idempotency key and original request across concurrent calls", async () => {
    const { run, create } = fixture();
    expect(await Promise.all([run(), run()])).toEqual(["fixture-secret", "fixture-secret"]);
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

  it("rejects Basic while a Pro session is open without taking a Basic reservation", async () => {
    const { run, list, reserve, create, retrieve } = fixture();
    list.mockImplementation(() => asPages([pending]));
    await expect(run("price_basic")).rejects.toThrow(/plano Pro.*Selecione o plano pendente/);
    expect(reserve).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(retrieve).toHaveBeenCalledWith(pending.id, { expand: ["line_items"] });
    await expect(run()).resolves.toBe("fixture-secret");
  });

  it("rejects Basic when the competing Pro reservation has no Stripe session yet", async () => {
    const { run, create, retrieve, price } = fixture();
    const [pro, basic] = await Promise.allSettled([run(), run("price_basic")]);
    expect(pro).toEqual({ status: "fulfilled", value: "fixture-secret" });
    expect(basic).toMatchObject({
      status: "rejected",
      reason: { message: expect.stringContaining("plano Pro") },
    });
    expect(price).toHaveBeenCalledWith("price_pro");
    expect(create).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledTimes(1);
  });

  it("fails closed if the retrieved session price cannot be confirmed", async () => {
    const { run, list, retrieve, create } = fixture();
    list.mockImplementation(() => asPages([pending]));
    retrieve.mockResolvedValue({ ...pending, line_items: undefined });
    await expect(run()).rejects.toThrow("confirmar o preço");
    expect(create).not.toHaveBeenCalled();
  });

  it("does not return an idempotent response for a completed checkout", async () => {
    const { run, retrieve } = fixture();
    retrieve.mockResolvedValue({ ...pending, status: "complete" });
    await expect(run()).rejects.toThrow("encerrado");
  });
});
