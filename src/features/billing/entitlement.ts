import { z } from "zod";
export const entitlementSchema = z.object({
  plan_type: z.string(),
  trial_ends_at: z.string(),
  plan_source: z.enum(["manual", "billing"]),
  service_wind_down: z.boolean().optional(),
  version: z.number(),
});
