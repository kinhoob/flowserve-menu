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
  const { data, error } = await database.rpc("reserve_billing_checkout", {
    p_user_id: userId,
    p_environment: environment,
    p_price_id: priceId,
    p_customer_id: customerId,
    p_return_url: returnUrl,
  });
  if (error) throw error;
  const slot = checkoutSlot.parse(data);

  // Stripe can already have an active or unsettled subscription while the webhook is in flight.
  for await (const subscription of stripe.subscriptions.list({
    customer: slot.customer_id,
    status: "all",
  })) {
    if (!["canceled", "incomplete_expired"].includes(subscription.status)) {
      throw new Error(
        "Você já tem uma assinatura ou pagamento em andamento. Use a área de assinatura.",
      );
    }
  }
  const isOwnOpenSession = (session: Stripe.Checkout.Session) =>
    session.status === "open" &&
    session.mode === "subscription" &&
    session.livemode === (environment === "live") &&
    session.metadata?.userId === userId;
  const getOpenSecret = async (sessionId: string) => {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!isOwnOpenSession(session) || !session.client_secret)
      throw new Error(
        "O checkout anterior já foi encerrado ou está indisponível. Confira a assinatura.",
      );
    return session.client_secret;
  };
  for await (const session of stripe.checkout.sessions.list({
    customer: slot.customer_id,
    status: "open",
  })) {
    if (isOwnOpenSession(session)) return getOpenSecret(session.id);
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
  return getOpenSecret(created.id);
}
