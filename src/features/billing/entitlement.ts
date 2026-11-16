import { z } from "zod";
export const entitlementSchema = z.object({
  plan_type: z.string(),
  trial_ends_at: z.string(),
  plan_source: z.enum(["manual", "billing"]),
  version: z.number(),
});
