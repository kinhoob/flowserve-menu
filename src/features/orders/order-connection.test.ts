import { describe, it, expect } from "vitest";
import { orderPollInterval } from "./order-connection";
describe("realtime fallback", () => {
  it("polls frequently until live updates are confirmed", () => {
    expect(orderPollInterval("connecting")).toBe(5000);
    expect(orderPollInterval("fallback")).toBe(5000);
    expect(orderPollInterval("live")).toBe(60000);
  });
});
