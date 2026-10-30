export const PLAN_PRICES = ["basic_monthly", "essential_monthly", "pro_monthly"] as const;

export function validateEnvironment(value: unknown): "live" | "sandbox" {
  if (value !== "live" && value !== "sandbox") throw new Error("Ambiente de pagamento inválido");
  const configured = process.env.PAYMENTS_ENVIRONMENT ?? "live";
  if (value !== configured) throw new Error("Ambiente de pagamento não habilitado no servidor");
  return value;
}

export function validatePlanPrice(value: string): string {
  if (!(PLAN_PRICES as readonly string[]).includes(value)) throw new Error("Plano inválido");
  return value;
}

export function validateReturnUrl(value: string | undefined, requestUrl: string): string {
  const origin = new URL(process.env.APP_URL ?? requestUrl).origin;
  const url = new URL(value ?? "/settings?tab=billing", origin);
  if (url.origin !== origin || url.username || url.password)
    throw new Error("URL de retorno inválida");
  return url.href;
}
