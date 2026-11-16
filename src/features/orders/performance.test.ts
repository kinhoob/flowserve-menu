import { describe, expect, it } from "vitest";
import type { Order } from "./order-queries";
import { orderPerformance } from "./performance";
const now = new Date("2026-11-16T15:00:00Z");
function order(id: string, status: string, extra: Partial<Order> = {}): Order {
  return {
    id,
    status,
    created_at: "2026-11-16T13:00:00Z",
    archived: false,
    subtotal: 20,
    order_items: [
      { menu_item_id: "dish", name_snapshot: "Prato", price_snapshot: 10, quantity: 2 },
    ],
    ...extra,
  } as Order;
}
describe("operational reports", () => {
  it("deduplicates active and archived results and excludes cancelled/open sales", () => {
    const served = order("1", "served");
    const result = orderPerformance(
      [served, served, order("2", "cancelled"), order("3", "preparing")],
      7,
      "America/Sao_Paulo",
      now,
    );
    expect(result.orders).toHaveLength(3);
    expect(result.revenue).toBe(20);
    expect(result.ticket).toBe(20);
    expect(result.ranking[0].quantity).toBe(2);
    expect(result.cancelled).toBe(1);
  });
  it("measures preparation only with valid events, excluding cancelled samples", () => {
    const stamps = { preparing_at: "2026-11-16T13:00:00Z", ready_at: "2026-11-16T13:12:00Z" };
    const result = orderPerformance(
      [order("1", "ready", stamps), order("2", "served"), order("3", "cancelled", stamps)],
      7,
      "America/Sao_Paulo",
      now,
    );
    expect(result.preparationSamples).toBe(1);
    expect(result.preparationMean).toBe(12);
    expect(result.preparationMedian).toBe(12);
  });
  it("honors restaurant dates and excludes future dates", () => {
    const result = orderPerformance(
      [
        order("1", "served", { created_at: "2026-11-10T02:00:00Z" }),
        order("2", "served", { created_at: "2026-11-17T15:00:00Z" }),
      ],
      7,
      "America/Sao_Paulo",
      now,
    );
    expect(result.orders).toEqual([]);
    expect(result.ticket).toBe(0);
    expect(result.preparationMean).toBeNull();
  });
});
