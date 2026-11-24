export const PAID_PLANS = {
  basic: { name: "Basic", amount: 3000, lookupKey: "basic_monthly" },
  essential: { name: "Essential", amount: 9900, lookupKey: "essential_monthly" },
  pro: { name: "Pro", amount: 19900, lookupKey: "pro_monthly" },
} as const;

export type PaidPlan = keyof typeof PAID_PLANS;
export const ESSENTIAL_QR_LIMIT = 10;

const FEATURE_MINIMUM = {
  dashboard: "basic",
  menu: "basic",
  tables: "essential",
  kitchen: "essential",
  waiter: "pro",
  analytics: "pro",
} as const;

export type FeatureKey = keyof typeof FEATURE_MINIMUM;

export function planHasFeature(plan: string | null | undefined, feature: FeatureKey): boolean {
  // Concessões Enterprise existentes mantêm o acesso. O catálogo não oferece contratação.
  const effective = plan === "trial" || plan === "enterprise" ? "pro" : plan;
  const minimum = FEATURE_MINIMUM[feature];
  return (
    effective === minimum ||
    effective === "pro" ||
    (effective === "essential" && minimum === "basic")
  );
}

export function minimumPlan(feature: FeatureKey): string {
  return PAID_PLANS[FEATURE_MINIMUM[feature]].name;
}

export function paidPlanByLookupKey(key: unknown) {
  return (Object.keys(PAID_PLANS) as PaidPlan[]).find((plan) => PAID_PLANS[plan].lookupKey === key);
}
