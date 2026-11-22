import { describe, it, expect } from "vitest";
import {
  buildReport,
  businessDay,
  changePercent,
  dayInput,
  defaultCutoff,
  inShift,
  parseDay,
  timeMinutes,
  type ReportFilters,
  type ReportItem,
  type ReportOrder,
} from "./report";
const now = new Date("2026-11-16T18:30:00Z");
const filters: ReportFilters = {
  start: parseDay("2026-11-10")!,
  end: parseDay("2026-11-16")!,
  timezone: "America/Sao_Paulo",
  cutoff: 0,
  department: "all",
  category: "all",
  shiftStart: null,
  shiftEnd: null,
  targetMinutes: 20,
};
function item(extra: Partial<ReportItem> = {}): ReportItem {
  return {
    id: "i1",
    menu_item_id: "p1",
    name_snapshot: "Prato",
    price_snapshot: 30,
    quantity: 1,
    department_snapshot: "food",
    category_id_snapshot: "c1",
    category_name_snapshot: "Pratos",
    ...extra,
  } as ReportItem;
}
function order(id: string, extra: Partial<ReportOrder> = {}): ReportOrder {
  return {
    id,
    status: "served",
    archived: false,
    created_at: "2026-11-16T13:00:00Z",
    subtotal: 999,
    service_fee: 0,
    cover_charge: 0,
    order_items: [item()],
    ...extra,
  } as ReportOrder;
}
describe("restaurant analytical reports", () => {
  it("counts delivered items only, separates closure, and never treats archive alone as payment or delivery", () => {
    const served = order("1");
    const report = buildReport(
      [
        served,
        served,
        order("2", { archived: true }),
        order("3", { status: "preparing" }),
        order("4", { status: "cancelled", archived: true }),
        order("5", { status: "pending", archived: true }),
      ],
      filters,
      now,
    ).current;
    expect(report.total).toBe(5);
    expect(report.sold).toBe(2);
    expect(report.cents).toBe(6000);
    expect(report.closedCents).toBe(3000);
    expect(report.deliveredCents).toBe(3000);
    expect(report.ticketCents).toBe(3000);
    expect(report.open).toBe(1);
    expect(report.unconfirmed).toBe(1);
    expect(report.cancelled).toBe(1);
    expect(report.cancellationRate).toBe(20);
  });
  it("attributes only selected line items from mixed kitchen/bar orders without duplicating the order total", () => {
    const mixed = order("1", {
      service_fee: 3,
      order_items: [
        item(),
        item({
          id: "i2",
          menu_item_id: "p2",
          price_snapshot: 20,
          department_snapshot: "drink",
          category_id_snapshot: "c2",
        }),
      ],
    });
    const all = buildReport([mixed], filters, now),
      food = buildReport([mixed], { ...filters, department: "food" }, now),
      bar = buildReport([mixed], { ...filters, department: "drink" }, now);
    expect(all.current.cents).toBe(5000);
    expect(all.current.feesCents).toBe(300);
    expect(food.current.cents).toBe(3000);
    expect(bar.current.cents).toBe(2000);
    expect(food.current.total).toBe(1);
    expect(food.feesApplicable).toBe(false);
    expect(buildReport([mixed], { ...filters, category: "c2" }, now).current.cents).toBe(2000);
  });
  it("preserves the classification captured at sale even if the live category changes", () => {
    const moved = item({
      menu_items: { category_id: "new", categories: { kind: "drink", name: "Outro setor" } },
    });
    expect(
      buildReport([order("1", { order_items: [moved] })], { ...filters, department: "food" }, now)
        .current.total,
    ).toBe(1);
    expect(
      buildReport([order("1", { order_items: [moved] })], { ...filters, department: "drink" }, now)
        .current.total,
    ).toBe(0);
  });
  it("does not merge distinct deleted products with the same displayed name", () => {
    const result = buildReport(
      [
        order("1", {
          order_items: [
            item({ menu_item_id: null, product_id_snapshot: "deleted-a" }),
            item({ id: "i2", menu_item_id: null, product_id_snapshot: "deleted-b" }),
          ],
        }),
      ],
      filters,
      now,
    );
    expect(result.current.products).toHaveLength(2);
  });
  it("identifies legacy catalogue fallbacks, unknown classifications and missing historical items", () => {
    const legacy = item({
      department_snapshot: null,
      category_id_snapshot: null,
      menu_items: { category_id: "old", categories: { kind: "food", name: "Atual" } },
    });
    const unknown = item({
      department_snapshot: null,
      category_id_snapshot: null,
      menu_item_id: null,
      menu_items: null,
    });
    const result = buildReport(
      [
        order("1", { order_items: [legacy] }),
        order("2", { order_items: [unknown] }),
        order("3", { order_items: [] }),
      ],
      filters,
      now,
    );
    expect(result.current.legacy).toBe(1);
    expect(result.current.unknown).toBe(1);
    expect(result.current.missingItems).toBe(1);
    expect(result.current.total).toBe(3);
    expect(
      buildReport(
        result.current.rows.map((r) => r.order),
        { ...filters, department: "unknown" },
        now,
      ).current.total,
    ).toBe(1);
  });
  it("compares today's partial interval only against the same local time of the previous interval", () => {
    const result = buildReport(
      [
        order("1"),
        order("2", { created_at: "2026-11-09T18:30:00Z" }),
        order("3", { created_at: "2026-11-09T18:30:01Z" }),
        order("4", { created_at: "2026-11-16T18:30:01Z" }),
      ],
      filters,
      now,
    );
    expect(result.partial).toBe(true);
    expect(result.previousStart).toBe(parseDay("2026-11-03"));
    expect(result.previous.total).toBe(1);
    expect(result.current.total).toBe(1);
  });
  it("includes complete past intervals, exact end dates, and excludes both earlier and future business days", () => {
    const result = buildReport(
      [
        order("1", { created_at: "2026-11-15T23:00:00Z" }),
        order("2", { created_at: "2026-11-16T03:00:00Z" }),
        order("3", { created_at: "2026-11-14T23:00:00Z" }),
      ],
      { ...filters, start: parseDay("2026-11-15")!, end: parseDay("2026-11-15")! },
      now,
    );
    expect(result.partial).toBe(false);
    expect(result.current.rows.map((r) => r.order.id)).toEqual(["1"]);
    expect(result.previous.total).toBe(1);
  });
  it("groups after-midnight orders into the configured business day with an exclusive cutoff", () => {
    expect(businessDay("2026-11-17T06:59:59Z", filters.timezone, 240)).toBe(parseDay("2026-11-16"));
    expect(businessDay("2026-11-17T07:00:00Z", filters.timezone, 240)).toBe(parseDay("2026-11-17"));
    const result = buildReport(
      [
        order("1", { created_at: "2026-11-17T06:59:59Z" }),
        order("2", { created_at: "2026-11-17T07:00:00Z" }),
      ],
      { ...filters, start: parseDay("2026-11-16")!, end: parseDay("2026-11-16")!, cutoff: 240 },
      new Date("2026-11-18T15:00:00Z"),
    );
    expect(result.current.total).toBe(1);
    expect(result.current.heat[0][3]).toBe(1);
  });
  it("uses civil-time cutoffs across DST instead of assuming 24-hour local days", () => {
    expect(businessDay("2026-11-01T05:30:00Z", "America/New_York", 240)).toBe(
      parseDay("2026-10-31"),
    );
    expect(businessDay("2026-11-01T06:30:00Z", "America/New_York", 240)).toBe(
      parseDay("2026-10-31"),
    );
    expect(businessDay("2026-11-01T09:00:00Z", "America/New_York", 240)).toBe(
      parseDay("2026-11-01"),
    );
  });
  it("filters overnight shifts without including the closing instant", () => {
    expect(inShift(23 * 60, 18 * 60, 2 * 60)).toBe(true);
    expect(inShift(60, 18 * 60, 120)).toBe(true);
    expect(inShift(120, 1080, 120)).toBe(false);
    expect(inShift(900, 1080, 120)).toBe(false);
  });
  it("reports measured queue, preparation, delivery and valid percentiles without counting cancelled or malformed timings", () => {
    const measured = {
      preparing_at: "2026-11-16T13:02:00Z",
      ready_at: "2026-11-16T13:12:00Z",
      delivered_at: "2026-11-16T13:15:00Z",
    };
    const result = buildReport(
      [
        order("1", measured),
        order("2", { ...measured, status: "cancelled" }),
        order("3", { preparing_at: measured.ready_at, ready_at: measured.preparing_at }),
        order("4", { preparing_at: "2026-11-10T00:00:00Z", ready_at: "2026-11-16T13:00:00Z" }),
      ],
      filters,
      now,
    ).current;
    expect(result.preparation.samples).toBe(1);
    expect(result.preparation.mean).toBe(10);
    expect(result.preparation.median).toBe(10);
    expect(result.preparation.p90).toBe(10);
    expect(result.delivery.mean).toBe(3);
    expect(result.queue.samples).toBe(2); // the inverted preparation still has a valid queue event
  });
  it("counts cancelled units separately from sold units and keeps cent arithmetic exact", () => {
    const sample = item({ price_snapshot: 10.1, quantity: 3 });
    const result = buildReport(
      [
        order("1", { order_items: [sample] }),
        order("2", {
          status: "cancelled",
          order_items: [sample],
          cancellation_reason: "Indisponível",
        }),
      ],
      filters,
      now,
    ).current;
    expect(result.cents).toBe(3030);
    expect(result.cancelledCents).toBe(3030);
    expect(result.products[0]).toMatchObject({ quantity: 3, cancelled: 3, demand: 6 });
    expect(result.reasons).toEqual([["Indisponível", 1]]);
  });
  it("keeps zero baselines and empty samples explicit instead of fabricating growth or duration", () => {
    expect(changePercent(100, 0)).toBeNull();
    expect(changePercent(100, 200)).toBe(-50);
    const empty = buildReport([], filters, now).current;
    expect(empty.preparation.mean).toBeNull();
    expect(empty.daily).toHaveLength(7);
    expect(empty.cancellationRate).toBe(0);
  });
  it("discards preparation events that are still in the future", () => {
    const result = buildReport(
      [
        order("future-events", {
          status: "ready",
          preparing_at: "2026-11-16T19:00:00Z",
          ready_at: "2026-11-16T19:10:00Z",
        }),
      ],
      filters,
      now,
    ).current;
    expect(result.preparation.samples).toBe(0);
    expect(result.queue.samples).toBe(0);
  });
  it("validates date and time inputs and derives a suggested cutoff from overnight service", () => {
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("2024-02-29")).not.toBeNull();
    expect(timeMinutes("24:00")).toBeNull();
    expect(timeMinutes("04:30")).toBe(270);
    expect(dayInput(parseDay("2026-11-16")!)).toBe("2026-11-16");
    expect(
      defaultCutoff({
        bar: [
          { enabled: true, open: "18:00", close: "01:00" },
          { enabled: true, open: "18:00", close: "03:30" },
        ],
        kitchen: [{ enabled: false, open: "18:00", close: "05:00" }],
      }),
    ).toBe("03:30");
    expect(() => buildReport([], { ...filters, end: filters.start + 93 }, now)).toThrow("93 dias");
  });
});

it("compares equivalent weekdays and excludes the gap between comparison windows", () => {
  const today = parseDay("2026-11-16")!;
  const result = buildReport(
    [
      order("current", { created_at: "2026-11-16T13:00:00Z" }),
      order("same-weekday", { created_at: "2026-11-09T13:00:00Z" }),
      order("gap", { created_at: "2026-11-12T13:00:00Z" }),
      order("later-previous", { created_at: "2026-11-09T20:00:00Z" }),
    ],
    { ...filters, start: today, end: today, comparison: "weekday" },
    now,
  );
  expect(result.previousStart).toBe(today - 7);
  expect(result.previousEnd).toBe(today - 7);
  expect(result.current.total).toBe(1);
  expect(result.previous.total).toBe(1);
});
