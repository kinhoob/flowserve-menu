import { PAID_PLANS, paidPlanByLookupKey } from "@/features/billing/plan-matrix";
import type Stripe from "stripe";
import { z } from "zod";
import { createBillingDatabase } from "./billing-database.server";
import type { StripeEnv } from "./stripe.server";

const checkoutSlot = z.object({
  attempt_id: z.string(),
  price_id: z.string(),
  customer_id: z.string(),
  return_url: z.string(),
  expires_at: z.number().int(),
});

export async function getPendingCheckout(
  stripe: Stripe,
  userId: string,
  environment: StripeEnv,
  priceId: string,
  customerId: string,
  returnUrl: string,
  database = createBillingDatabase(),
) {
  const pendingPlanError = (lookupKey?: string | null) => {
    const plan = paidPlanByLookupKey(lookupKey);
    const label = plan ? `do plano ${PAID_PLANS[plan].name}` : "de outro plano";
    return new Error(
      `Você tem um checkout pendente ${label}. Selecione o plano pendente para continuar ou aguarde a expiração antes de escolher outro.`,
    );
  };
  const customerMatches = (session: Stripe.Checkout.Session, customer: string) =>
    (typeof session.customer === "string" ? session.customer : session.customer?.id) === customer;
  const isOwnOpenSession = (session: Stripe.Checkout.Session, customer: string) =>
    session.status === "open" &&
    session.mode === "subscription" &&
    session.livemode === (environment === "live") &&
    session.metadata?.userId === userId &&
    customerMatches(session, customer);
  const getOpenSecret = async (sessionId: string, customer: string) => {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });
    if (!isOwnOpenSession(session, customer) || !session.client_secret)
      throw new Error(
        "O checkout anterior já foi encerrado ou está indisponível. Confira a assinatura.",
      );
    const items = session.line_items;
    const item = items?.data[0];
    if (items?.has_more || items?.data.length !== 1 || item?.quantity !== 1 || !item.price)
      throw new Error(
        "Não foi possível confirmar o preço do checkout pendente. Aguarde a expiração.",
      );
    if (item.price.id !== priceId) throw pendingPlanError(item.price.lookup_key);
    return session.client_secret;
  };
  const findOpenSecret = async (customer: string) => {
    // Stripe can already have a subscription while the webhook is in flight.
    for await (const subscription of stripe.subscriptions.list({ customer, status: "all" })) {
      if (!["canceled", "incomplete_expired"].includes(subscription.status))
        throw new Error(
          "Você já tem uma assinatura ou pagamento em andamento. Use a área de assinatura.",
        );
    }
    for await (const session of stripe.checkout.sessions.list({ customer, status: "open" })) {
      if (isOwnOpenSession(session, customer)) return getOpenSecret(session.id, customer);
    }
  };

  // Check older Stripe sessions before reserving a slot for the requested price.
  const existingSecret = await findOpenSecret(customerId);
  if (existingSecret) return existingSecret;
  const { data, error } = await database.rpc("reserve_billing_checkout", {
    p_user_id: userId,
    p_environment: environment,
    p_price_id: priceId,
    p_customer_id: customerId,
    p_return_url: returnUrl,
  });
  if (error) throw error;
  const slot = checkoutSlot.parse(data);
  if (slot.price_id !== priceId) {
    const price = await stripe.prices.retrieve(slot.price_id).catch(() => null);
    throw pendingPlanError(price?.lookup_key);
  }
  if (slot.customer_id !== customerId) {
    const reservedSecret = await findOpenSecret(slot.customer_id);
    if (reservedSecret) return reservedSecret;
  }
  const created = await stripe.checkout.sessions.create(
    {
      line_items: [{ price: slot.price_id, quantity: 1 }],
      mode: "subscription",
      ui_mode: "embedded_page",
      return_url: slot.return_url,
      customer: slot.customer_id,
      expires_at: slot.expires_at,
      metadata: { userId },
      subscription_data: { metadata: { userId } },
    },
    { idempotencyKey: slot.attempt_id },
  );
  // A retried create can return Stripe's original response after the session has completed.
  return getOpenSecret(created.id, slot.customer_id);
}
