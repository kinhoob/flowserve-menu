import { describe, it, expect } from "vitest";
import { canAccess, canContinueService, minimumPlan } from "./trial-status";
describe("trial wind down", () => {
  const expired = { plan_type: "trial", trial_ends_at: "2020-01-01T00:00:00Z" };
  it("keeps open orders and tables accessible for closing", () => {
    const windDown = { ...expired, service_wind_down: true };
    expect(canAccess(expired, "kitchen")).toBe(false);
    expect(canContinueService(windDown, "kitchen")).toBe(true);
    expect(canContinueService(windDown, "tables")).toBe(true);
    expect(canContinueService(expired, "kitchen")).toBe(false);
    expect(canContinueService(windDown, "waiter")).toBe(false);
    expect(canContinueService(windDown, "analytics")).toBe(false);
    expect(canContinueService(expired, "menu")).toBe(false);
  });
  it("does not grant higher plan features to Basic", () => {
    expect(canContinueService({ ...expired, plan_type: "basic" }, "waiter")).toBe(false);
    expect(canContinueService(null, "dashboard")).toBe(false);
    expect(minimumPlan("kitchen")).toBe("Essential");
    expect(minimumPlan("analytics")).toBe("Pro");
  });
});
