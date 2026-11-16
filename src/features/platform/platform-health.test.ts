import { describe, it, expect } from "vitest";
import {
  ratioPercent,
  registrationChange,
  healthSchema,
  attentionReasons,
} from "./platform-health";
describe("platform indicators", () => {
  it("distinguishes an empty cohort from a nonconverting cohort", () => {
    expect(ratioPercent(0, 0)).toBeNull();
    expect(ratioPercent(0, 10)).toBe(0);
    expect(ratioPercent(2, 8)).toBe(25);
  });
  it("does not invent growth percentages when there is no prior registration base", () => {
    expect(registrationChange(5, 0)).toBeNull();
    expect(registrationChange(0, 5)).toBe(-100);
    expect(registrationChange(6, 4)).toBe(50);
  });
  it("validates progress bounds and groups all reasons for the same restaurant", () => {
    const health = {
      id: "r",
      name: "Restaurante",
      slug: "restaurante",
      owner_email: null,
      created_at: "2026-11-15T00:00:00Z",
      entitlement: {
        plan_type: "trial",
        trial_ends_at: "2026-11-18T00:00:00Z",
        plan_source: "billing",
        version: 0,
      },
      products: 0,
      available_products: 0,
      tables: 0,
      menu_ready: false,
      tables_ready: false,
      hours_ready: false,
      first_order_ready: false,
      completed_steps: 0,
      first_order_at: null,
      last_order_at: null,
      trial_active: true,
      trial_ending: true,
      trial_expired: false,
      manual_plan: false,
      subscription_active: false,
      subscription_attention: false,
      setup_attention: true,
      inactive_attention: false,
      needs_attention: true,
    };
    const parsed = healthSchema.parse(health);
    expect(attentionReasons(parsed).map((r) => r.key)).toEqual(["ending", "setup"]);
    expect(healthSchema.safeParse({ ...health, completed_steps: 5 }).success).toBe(false);
  });
});
