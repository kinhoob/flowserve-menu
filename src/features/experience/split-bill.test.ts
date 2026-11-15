import { describe, expect, it } from "vitest";
import { billTotalCents, splitBillCents } from "./split-bill";
describe("equal bill split", () => {
  it("distributes remaining cents while preserving the exact total", () => {
    expect(splitBillCents(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitBillCents(2, 3)).toEqual([1, 1, 0]);
  });
  it("keeps the sum and a maximum one-cent difference for all supported party sizes", () => {
    for (const total of [0, 1, 99, 1599, 10000, 500000])
      for (let people = 1; people <= 20; people++) {
        const shares = splitBillCents(total, people);
        expect(shares.reduce((sum, share) => sum + share, 0)).toBe(total);
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
      }
  });
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unsafe monetary totals: %s",
    (total) => {
      expect(() => splitBillCents(total, 2)).toThrow();
    },
  );
  it.each([0, -1, 1.5, 21, NaN])("rejects invalid party sizes: %s", (people) => {
    expect(() => splitBillCents(10000, people)).toThrow();
  });
});

it.each([
  [1.005, 101],
  [10.075, 1008],
  [31.9, 3190],
])("rounds the displayed bill total %s before splitting", (total, expected) => {
  expect(billTotalCents(total)).toBe(expected);
});
