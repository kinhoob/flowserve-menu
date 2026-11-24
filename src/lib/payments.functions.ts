import { getPendingCheckout } from "./checkout-session.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
  matchesPlanPrice,
  validateEnvironment,
  validatePlanPrice,
  validateReturnUrl,
} from "./payment-policy";

type CheckoutSessionResult = { clientSecret: string } | { error: string };
type PortalSessionResult = { url: string } | { error: string };
type UpdatePlanResult = { ok: true; pending: boolean } | { error: string };

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }
  const created = await stripe.customers.create(
    {
      ...(options.email && { email: options.email }),
      ...(options.userId && { metadata: { userId: options.userId } }),
    },
    { idempotencyKey: `flux-customer-${options.userId}` },
  );
  return created.id;
}

async function resolvePlanPrice(
  stripe: ReturnType<typeof createStripeClient>,
  lookupKey: string,
  environment: StripeEnv,
) {
  const { data } = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 2 });
  const [price] = data;
  if (data.length !== 1 || !matchesPlanPrice(price, lookupKey, environment))
    throw new Error("Preço mensal do plano indisponível");
  return price;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { priceId: string; quantity?: number; returnUrl: string; environment: StripeEnv }) => {
      validatePlanPrice(data.priceId);
      validateEnvironment(data.environment);
      if (data.quantity !== undefined && data.quantity !== 1)
        throw new Error("Quantidade inválida");
      return data;
    },
  )
  .handler(async ({ data, context }): Promise<CheckoutSessionResult> => {
    try {
      const stripe = createStripeClient(data.environment);

      const stripePrice = await resolvePlanPrice(stripe, data.priceId, data.environment);

      const { userId, claims, supabase } = context;
      const { data: active, error: activeError } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .eq("environment", data.environment)
        .in("status", ["active", "trialing", "past_due"])
        .limit(1);
      if (activeError) throw activeError;
      if (active?.length) throw new Error("Você já tem uma assinatura. Use a troca de plano.");
      const customerId = await resolveOrCreateCustomer(stripe, {
        userId,
        email: typeof claims.email === "string" ? claims.email : undefined,
      });

      const clientSecret = await getPendingCheckout(
        stripe,
        userId,
        data.environment,
        stripePrice.id,
        customerId,
        validateReturnUrl(data.returnUrl, getRequest().url),
      );
      return { clientSecret };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { returnUrl?: string; environment: StripeEnv }) => {
    validateEnvironment(data.environment);
    return data;
  })
  .handler(async ({ data, context }): Promise<PortalSessionResult> => {
    const { supabase, userId } = context;

    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError || !sub?.stripe_customer_id) {
      return { error: "Nenhuma assinatura encontrada para gerenciar." };
    }

    try {
      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id as string,
        return_url: validateReturnUrl(data.returnUrl, getRequest().url),
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

// Swap the price of an existing active subscription, prorating the change.
// This avoids creating a second parallel subscription when the user clicks
// another plan card while already subscribed.
export const updateSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { newPriceId: string; environment: StripeEnv }) => {
    validatePlanPrice(data.newPriceId);
    validateEnvironment(data.environment);
    return data;
  })
  .handler(async ({ data, context }): Promise<UpdatePlanResult> => {
    const { supabase, userId } = context;

    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id, status")
      .eq("user_id", userId)
      .eq("environment", data.environment)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError || !sub?.stripe_subscription_id) {
      return { error: "Nenhuma assinatura ativa para trocar." };
    }

    try {
      const stripe = createStripeClient(data.environment);

      const newPrice = await resolvePlanPrice(stripe, data.newPriceId, data.environment);

      // Need the current subscription item id to swap its price.
      const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id as string);
      const itemId = current.items.data[0]?.id;
      if (!itemId) throw new Error("Subscription has no items");

      const updated = await stripe.subscriptions.update(sub.stripe_subscription_id as string, {
        items: [{ id: itemId, price: newPrice.id }],
        proration_behavior: "always_invoice",
        payment_behavior: "pending_if_incomplete",
      });

      return { ok: true, pending: !!updated.pending_update };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const verifyCheckoutSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { sessionId: string; environment: StripeEnv }) => {
    validateEnvironment(data.environment);
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(data.sessionId)) {
      throw new Error("Sessão de pagamento inválida");
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<boolean> => {
    const stripe = createStripeClient(data.environment);
    const session = await stripe.checkout.sessions.retrieve(data.sessionId).catch(() => {
      throw new Error("Não foi possível verificar a sessão do Stripe");
    });
    if (
      session.metadata?.userId !== context.userId ||
      session.status !== "complete" ||
      session.livemode !== (data.environment === "live") ||
      !session.subscription
    )
      return false;
    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    const { data: subscription, error } = await context.supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", context.userId)
      .eq("environment", data.environment)
      .eq("stripe_subscription_id", subscriptionId)
      .in("status", ["active", "trialing"])
      .maybeSingle();
    if (error) throw new Error("Não foi possível consultar a confirmação da assinatura");
    return !!subscription;
  });
