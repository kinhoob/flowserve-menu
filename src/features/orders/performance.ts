import type { Order } from "./order-queries";
import { dateOrdinal } from "@/lib/operations";
export function orderPerformance(
  orders: Order[],
  days: number,
  timezone: string,
  now = new Date(),
) {
  const today = dateOrdinal(now, timezone),
    since = today - days + 1;
  const unique = [...new Map(orders.map((order) => [order.id, order])).values()].filter((order) => {
    const day = dateOrdinal(order.created_at, timezone);
    return day >= since && day <= today;
  });
  const sold = unique.filter(
    (order) => order.status !== "cancelled" && (order.archived || order.status === "served"),
  );
  const revenueCents = sold.reduce(
    (sum, order) => sum + Math.round(Number(order.subtotal) * 100),
    0,
  );
  const durations = unique
    .filter((order) => order.status !== "cancelled" && order.preparing_at && order.ready_at)
    .map((order) => (Date.parse(order.ready_at!) - Date.parse(order.preparing_at!)) / 60000)
    .filter((minutes) => Number.isFinite(minutes) && minutes >= 0)
    .sort((a, b) => a - b);
  const cancelled = unique.filter((order) => order.status === "cancelled").length;
  const ranking = new Map<string, { name: string; quantity: number; revenueCents: number }>();
  for (const order of sold)
    for (const item of order.order_items) {
      const key = item.menu_item_id ?? item.name_snapshot;
      const current = ranking.get(key) ?? {
        name: item.name_snapshot,
        quantity: 0,
        revenueCents: 0,
      };
      current.quantity += item.quantity;
      current.revenueCents += Math.round(Number(item.price_snapshot) * 100) * item.quantity;
      ranking.set(key, current);
    }
  return {
    orders: unique,
    soldCount: sold.length,
    revenue: revenueCents / 100,
    ticket: sold.length ? revenueCents / 100 / sold.length : 0,
    cancelled,
    cancellationRate: unique.length ? (cancelled / unique.length) * 100 : 0,
    preparationSamples: durations.length,
    preparationMean: durations.length
      ? durations.reduce((sum, n) => sum + n, 0) / durations.length
      : null,
    preparationMedian: durations.length
      ? (durations[Math.floor((durations.length - 1) / 2)] +
          durations[Math.floor(durations.length / 2)]) /
        2
      : null,
    ranking: [...ranking.values()].sort((a, b) => b.quantity - a.quantity),
  };
}
