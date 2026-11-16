import type { Order, OrderItem } from "@/features/orders/order-queries";

export type Department = "all" | "food" | "drink" | "unknown";
export type ReportItem = OrderItem & {
  product_id_snapshot?: string | null;
  category_id_snapshot?: string | null;
  category_name_snapshot?: string | null;
  department_snapshot?: string | null;
  menu_items?: {
    category_id: string;
    categories: { kind: string; name?: string; id?: string } | null;
  } | null;
};
export type ReportOrder = Omit<Order, "order_items"> & { order_items: ReportItem[] };
export type ReportFilters = {
  start: number;
  end: number;
  timezone: string;
  cutoff: number;
  department: Department;
  category: string;
  shiftStart: number | null;
  shiftEnd: number | null;
  targetMinutes: number;
};
export type ReportRow = {
  order: ReportOrder;
  items: ReportItem[];
  day: number;
  hour: number;
  cents: number;
  stage: "cancelled" | "open" | "closed" | "delivered" | "unconfirmed";
};
const DAY = 86400000;
const formatters = new Map<string, Intl.DateTimeFormat>();
export function localClock(value: Date | string, timezone: string) {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timezone, formatter);
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(value)).map((p) => [p.type, p.value]),
  );
  const ordinal = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / DAY;
  return {
    ordinal,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
    second: Number(parts.second),
    hour: Number(parts.hour),
  };
}
export function businessDay(value: Date | string, timezone: string, cutoff: number) {
  const clock = localClock(value, timezone);
  return clock.ordinal - (clock.minute < cutoff ? 1 : 0);
}
export function dayInput(ordinal: number) {
  return new Date(ordinal * DAY).toISOString().slice(0, 10);
}
export function parseDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ordinal = Date.parse(`${value}T00:00:00Z`) / DAY;
  return Number.isFinite(ordinal) && dayInput(ordinal) === value ? ordinal : null;
}
export function timeMinutes(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
export function defaultCutoff(value: unknown) {
  const hours = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const times = [hours.bar, hours.kitchen]
    .flatMap((days) => (Array.isArray(days) ? days : []))
    .flatMap((day) => {
      if (
        !day ||
        typeof day !== "object" ||
        !day.enabled ||
        typeof day.open !== "string" ||
        typeof day.close !== "string"
      )
        return [];
      const open = timeMinutes(day.open),
        close = timeMinutes(day.close);
      return open !== null && close !== null && close < open ? [close] : [];
    });
  const minute = Math.max(0, ...times);
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
export function dayLabel(ordinal: number) {
  return new Date(ordinal * DAY).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
  });
}
export function departmentOf(item: ReportItem): Exclude<Department, "all"> {
  const kind = item.department_snapshot ?? item.menu_items?.categories?.kind;
  return kind === "drink" ? "drink" : kind === "food" ? "food" : "unknown";
}
export function categoryOf(item: ReportItem) {
  return item.category_id_snapshot ?? item.menu_items?.category_id ?? "unknown";
}
export function categoryName(item: ReportItem) {
  return (
    item.category_name_snapshot ?? item.menu_items?.categories?.name ?? "Sem categoria histórica"
  );
}
export function itemCents(item: ReportItem) {
  return Math.round(Number(item.price_snapshot) * 100) * item.quantity;
}
export function inShift(minute: number, start: number | null, end: number | null) {
  if (start === null || end === null) return true;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}
export function changePercent(current: number, previous: number) {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}
function durations(
  rows: ReportRow[],
  from: "created_at" | "preparing_at" | "ready_at",
  to: "preparing_at" | "ready_at" | "delivered_at",
  now: Date,
) {
  return rows
    .filter((r) => r.stage !== "cancelled")
    .flatMap(({ order }) => {
      const a = order[from],
        b = order[to];
      if (!a || !b) return [];
      const duration = (Date.parse(b) - Date.parse(a)) / 60000;
      return Number.isFinite(duration) &&
        duration >= 0 &&
        duration <= 1440 &&
        Date.parse(b) <= now.getTime()
        ? [duration]
        : [];
    })
    .sort((a, b) => a - b);
}
export function durationStats(values: number[]) {
  return {
    samples: values.length,
    mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    median: values.length
      ? (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2
      : null,
    p90: values.length ? values[Math.ceil(values.length * 0.9) - 1] : null,
  };
}
export function summarize(
  rows: ReportRow[],
  start: number,
  end: number,
  targetMinutes: number,
  now: Date,
) {
  const daily = Array.from({ length: end - start + 1 }, (_, i) => ({
    day: start + i,
    cents: 0,
    orders: 0,
  }));
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const products = new Map<
    string,
    {
      id: string;
      name: string;
      quantity: number;
      demand: number;
      cancelled: number;
      cents: number;
      category: string;
    }
  >();
  const reasons = new Map<string, number>();
  let cents = 0,
    closedCents = 0,
    deliveredCents = 0,
    feesCents = 0,
    openCents = 0,
    cancelledCents = 0,
    closed = 0,
    delivered = 0,
    open = 0,
    unconfirmed = 0,
    unconfirmedCents = 0,
    cancelled = 0,
    legacy = 0,
    unknown = 0,
    missingItems = 0,
    overdue = 0;
  for (const row of rows) {
    const { order, items, day, hour, stage } = row;
    if (order.order_items.length === 0) missingItems++;
    legacy += items.filter((i) => !i.department_snapshot && departmentOf(i) !== "unknown").length;
    unknown += items.filter((i) => departmentOf(i) === "unknown").length;
    if (stage === "cancelled") {
      cancelled++;
      cancelledCents += row.cents;
      const reason = order.cancellation_reason?.trim() || "Sem motivo registrado";
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    } else {
      daily[day - start].orders++;
      heat[(((day + 3) % 7) + 7) % 7][hour]++;
      if (stage === "open") {
        open++;
        openCents += row.cents;
        const elapsed =
          (now.getTime() -
            Date.parse(
              order.status === "preparing"
                ? (order.preparing_at ?? order.created_at)
                : order.created_at,
            )) /
          60000;
        if (["pending", "accepted", "preparing"].includes(order.status) && elapsed > targetMinutes)
          overdue++;
      } else if (stage === "unconfirmed") {
        unconfirmed++;
        unconfirmedCents += row.cents;
      } else {
        cents += row.cents;
        daily[day - start].cents += row.cents;
        feesCents += Math.round(
          (Number(order.service_fee ?? 0) + Number(order.cover_charge ?? 0)) * 100,
        );
        if (stage === "closed") {
          closed++;
          closedCents += row.cents;
        } else {
          delivered++;
          deliveredCents += row.cents;
        }
      }
    }
    for (const item of items) {
      const id = item.product_id_snapshot ?? item.menu_item_id ?? `removed:${item.name_snapshot}`;
      const product = products.get(id) ?? {
        id,
        name: item.name_snapshot,
        quantity: 0,
        demand: 0,
        cancelled: 0,
        cents: 0,
        category: categoryName(item),
      };
      product.demand += item.quantity;
      if (stage === "cancelled") product.cancelled += item.quantity;
      if (stage === "closed" || stage === "delivered") {
        product.quantity += item.quantity;
        product.cents += itemCents(item);
      }
      products.set(id, product);
    }
  }
  const preparationValues = durations(rows, "preparing_at", "ready_at", now);
  const preparation = durationStats(preparationValues);
  const total = rows.length;
  const sold = closed + delivered;
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: heat.reduce((sum, row) => sum + row[hour], 0),
  }));
  const peak = [...hourly].sort((a, b) => b.count - a.count || a.hour - b.hour)[0];
  return {
    rows,
    total,
    sold,
    open,
    unconfirmed,
    unconfirmedCents,
    cancelled,
    cents,
    closed,
    delivered,
    closedCents,
    deliveredCents,
    openCents,
    cancelledCents,
    feesCents,
    ticketCents: sold ? Math.round(cents / sold) : 0,
    cancellationRate: total ? (cancelled / total) * 100 : 0,
    daily,
    heat,
    hourly,
    peak,
    products: [...products.values()].sort(
      (a, b) => b.quantity - a.quantity || b.cents - a.cents || a.name.localeCompare(b.name),
    ),
    reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]),
    preparation,
    queue: durationStats(durations(rows, "created_at", "preparing_at", now)),
    delivery: durationStats(durations(rows, "ready_at", "delivered_at", now)),
    overTarget: preparationValues.filter((v) => v > targetMinutes).length,
    overdue,
    legacy,
    unknown,
    missingItems,
  };
}
export function buildReport(orders: ReportOrder[], filters: ReportFilters, now = new Date()) {
  const {
    start,
    end,
    timezone,
    cutoff,
    department,
    category,
    shiftStart,
    shiftEnd,
    targetMinutes,
  } = filters;
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start || end - start >= 93)
    throw new Error("Selecione um período de até 93 dias.");
  const length = end - start + 1,
    previousStart = start - length,
    previousEnd = start - 1;
  const currentClock = localClock(now, timezone);
  const today = businessDay(now, timezone, cutoff);
  const elapsed = ((currentClock.minute - cutoff + 1440) % 1440) * 60 + currentClock.second;
  const current: ReportRow[] = [],
    previous: ReportRow[] = [];
  const unique = [...new Map(orders.map((order) => [order.id, order])).values()].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  const categories = new Map<string, string>();
  let unclassifiedInPeriod = 0;
  for (const order of unique) {
    for (const item of order.order_items)
      if (!categories.has(categoryOf(item))) categories.set(categoryOf(item), categoryName(item));
    if (Date.parse(order.created_at) > now.getTime()) continue;
    const clock = localClock(order.created_at, timezone);
    const day = clock.ordinal - (clock.minute < cutoff ? 1 : 0);
    if (day < previousStart || day > end || !inShift(clock.minute, shiftStart, shiftEnd)) continue;
    const isCurrent = day >= start;
    if (
      !isCurrent &&
      end === today &&
      day === previousEnd &&
      ((clock.minute - cutoff + 1440) % 1440) * 60 + clock.second > elapsed
    )
      continue;
    if (isCurrent)
      unclassifiedInPeriod += order.order_items.filter(
        (item) => departmentOf(item) === "unknown",
      ).length;
    const items = order.order_items.filter(
      (item) =>
        (department === "all" || departmentOf(item) === department) &&
        (category === "all" || categoryOf(item) === category),
    );
    if (
      items.length === 0 &&
      (order.order_items.length > 0 || department !== "all" || category !== "all")
    )
      continue;
    const stage =
      order.status === "cancelled"
        ? "cancelled"
        : order.status === "served"
          ? order.archived
            ? "closed"
            : "delivered"
          : order.archived
            ? "unconfirmed"
            : "open";
    const row: ReportRow = {
      order,
      items,
      day,
      hour: clock.hour,
      cents: items.reduce((sum, item) => sum + itemCents(item), 0),
      stage,
    };
    (isCurrent ? current : previous).push(row);
  }
  return {
    current: summarize(current, start, end, targetMinutes, now),
    previous: summarize(previous, previousStart, previousEnd, targetMinutes, now),
    previousStart,
    previousEnd,
    partial: end === today,
    feesApplicable: department === "all" && category === "all",
    unclassifiedInPeriod,
    categories: [...categories.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
export type RestaurantReport = ReturnType<typeof buildReport>;
