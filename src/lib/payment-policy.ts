import { PAID_PLANS, paidPlanByLookupKey } from "@/features/billing/plan-matrix";

export const PLAN_PRICES = Object.values(PAID_PLANS).map((plan) => plan.lookupKey);

export function matchesPlanPrice(
  price: {
    lookup_key: string | null;
    active: boolean;
    livemode: boolean;
    currency: string;
    unit_amount: number | null;
    recurring: { interval: string; interval_count: number; usage_type: string } | null;
  },
  key: string,
  environment: "live" | "sandbox",
) {
  const plan = paidPlanByLookupKey(key);
  return (
    !!plan &&
    price.active &&
    price.lookup_key === key &&
    price.livemode === (environment === "live") &&
    price.currency === "brl" &&
    price.unit_amount === PAID_PLANS[plan].amount &&
    price.recurring?.interval === "month" &&
    price.recurring.interval_count === 1 &&
    price.recurring.usage_type === "licensed"
  );
}

export function validateEnvironment(value: unknown): "live" | "sandbox" {
  if (value !== "live" && value !== "sandbox") throw new Error("Ambiente de pagamento inválido");
  const configured = process.env.PAYMENTS_ENVIRONMENT ?? "live";
  if (value !== configured) throw new Error("Ambiente de pagamento não habilitado no servidor");
  return value;
}

export function validatePlanPrice(value: string): string {
  if (!paidPlanByLookupKey(value)) throw new Error("Plano inválido");
  return value;
}

export function validateReturnUrl(value: string | undefined, requestUrl: string): string {
  const configured = process.env.APP_URL;
  const base = new URL(configured ?? requestUrl);
  if (
    process.env.PAYMENTS_ENVIRONMENT === "live" &&
    (!configured || base.protocol !== "https:" || base.username || base.password)
  ) {
    throw new Error("Configure APP_URL com a origem HTTPS publicada");
  }
  const origin = base.origin;
  const url = new URL(value ?? "/settings?tab=billing", origin);
  if (url.origin !== origin || url.username || url.password)
    throw new Error("URL de retorno inválida");
  return url.href;
}
