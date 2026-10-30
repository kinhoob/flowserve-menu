import { describe, it, expect } from "vitest";
import {
  normalizeTableLabel,
  isOpenOrder,
  restaurantDate,
  restaurantHour,
  dateOrdinal,
  fetchAllPages,
} from "./operations";

describe("operational consistency", () => {
  it("keeps a delivered order open until the bill is closed", () => {
    expect(isOpenOrder({ status: "served", archived: false })).toBe(true);
    expect(isOpenOrder({ status: "served", archived: true })).toBe(false);
    expect(isOpenOrder({ status: "cancelled" })).toBe(false);
  });
  it("matches the same table across dashboard, QR codes and tables", () => {
    expect(normalizeTableLabel("Mesa Mesa 1")).toBe(normalizeTableLabel(" 1 "));
    expect(normalizeTableLabel("Mesa Varanda")).toBe(normalizeTableLabel("varanda"));
  });
  it("counts a UTC timestamp against the restaurant calendar day", () => {
    expect(restaurantDate("2026-10-30T01:00:00Z", "America/Sao_Paulo")).toBe("2026-10-29");
    expect(restaurantHour("2026-10-30T01:00:00Z", "America/Sao_Paulo")).toBe(22);
    expect(
      dateOrdinal("2026-10-30T01:00:00Z", "UTC") -
        dateOrdinal("2026-10-30T01:00:00Z", "America/Sao_Paulo"),
    ).toBe(1);
  });
  it("loads beyond the old 200-order limit", async () => {
    const source = Array.from({ length: 1203 }, (_, i) => i);
    expect(
      await fetchAllPages<number>(async (a, b) => ({ data: source.slice(a, b + 1), error: null })),
    ).toEqual(source);
  });
  it("does not turn a failed page into an incomplete success", async () => {
    await expect(
      fetchAllPages(async () => ({ data: null, error: new Error("offline") })),
    ).rejects.toThrow("offline");
  });
});
