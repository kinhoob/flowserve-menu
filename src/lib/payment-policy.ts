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
  const configured = configuredPaymentEnvironment();
  if (value !== configured) throw new Error("Ambiente de pagamento não habilitado no servidor");
  return value;
}

function configuredPaymentEnvironment() {
  const configured = process.env.PAYMENTS_ENVIRONMENT;
  if (configured !== "live" && configured !== "sandbox")
    throw new Error("Configure PAYMENTS_ENVIRONMENT como live ou sandbox");
  if (configured === "live") requireLiveOrigin();
  return configured;
}

export function validatePlanPrice(value: string): string {
  if (!paidPlanByLookupKey(value)) throw new Error("Plano inválido");
  return value;
}

function requireLiveOrigin(): URL {
  const configured = process.env.APP_URL;
  if (!configured) throw new Error("Configure APP_URL com a origem HTTPS publicada");
  const url = URL.parse(configured);
  if (
    !url ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Configure APP_URL com a origem HTTPS publicada");
  }
  return url;
}

export function validateReturnUrl(value: string | undefined, requestUrl: string): string {
  const origin = (
    configuredPaymentEnvironment() === "live"
      ? requireLiveOrigin()
      : new URL(process.env.APP_URL ?? requestUrl)
  ).origin;
  const url = new URL(value ?? "/settings?tab=billing", origin);
  if (url.origin !== origin || url.username || url.password)
    throw new Error("URL de retorno inválida");
  return url.href;
}
