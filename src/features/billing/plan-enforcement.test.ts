import { describe, expect, it } from "vitest";
import { getTableLimit } from "./plan-limits";
import { canAccess, canOpenFeature, canReadAnalytics, minimumPlan } from "./trial-status";

const later = "2999-01-01T00:00:00Z";
const earlier = "2000-01-01T00:00:00Z";

describe("commercial plan policy", () => {
  it.each([
    ["basic", 0, false, false],
    ["essential", 10, true, false],
    ["pro", Infinity, true, true],
    ["enterprise", Infinity, true, true],
    ["trial", Infinity, true, true],
    ["unrecognized", null, false, false],
  ])(
    "resolves QR limits, kitchen and Pro-only audio for %s",
    (plan_type, limit, kitchen, audio) => {
      const info = { plan_type, trial_ends_at: later };
      expect(getTableLimit(info)).toBe(limit);
      expect(canAccess(info, "kitchen")).toBe(kitchen);
      expect(canAccess(info, "kitchenSound")).toBe(audio);
      expect(canAccess(info, "waiter")).toBe(audio);
      expect(canReadAnalytics(info)).toBe(audio);
    },
  );

  it("closes access on an absent or invalid plan and retains historical data after trial expiry", () => {
    expect(getTableLimit(undefined)).toBeNull();
    expect(getTableLimit({ plan_type: "trial", trial_ends_at: "invalid" })).toBeNull();
    expect(canReadAnalytics({ plan_type: "trial", trial_ends_at: "invalid" })).toBe(false);
    const expired = { plan_type: "trial", trial_ends_at: earlier };
    expect(getTableLimit(expired)).toBeNull();
    expect(canAccess(expired, "kitchenSound")).toBe(false);
    expect(canOpenFeature(expired, "analytics")).toBe(true);
    expect(canOpenFeature(expired, "menu")).toBe(true);
    expect(canOpenFeature(expired, "tables")).toBe(true);
    expect(minimumPlan("kitchen")).toBe("Essential");
    expect(minimumPlan("kitchenSound")).toBe("Pro");
  });
});
