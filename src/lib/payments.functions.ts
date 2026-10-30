import { getRequest } from "@tanstack/react-start/server";
import { validateEnvironment, validatePlanPrice, validateReturnUrl } from "./payment-policy";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";

type CheckoutSessionResult = { clientSecret: string } | { error: string };
type PortalSessionResult = { url: string } | { error: string };
type UpdatePlanResult = { ok: true } | { error: string };

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

      let stripePrice;
      if (data.priceId.startsWith("price_")) {
        stripePrice = await stripe.prices.retrieve(data.priceId);
      } else {
        const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
        if (!prices.data.length) throw new Error("Price not found");
        stripePrice = prices.data[0];
      }
      const isRecurring = stripePrice.type === "recurring";

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
      if (!stripePrice.active || !isRecurring || stripePrice.currency !== "brl")
        throw new Error("Preço indisponível");

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: "subscription",
        ui_mode: "embedded_page",
        return_url: validateReturnUrl(data.returnUrl, getRequest().url),
        ...(customerId && { customer: customerId }),
        ...(userId && {
          metadata: { userId },
          ...(isRecurring && { subscription_data: { metadata: { userId } } }),
        }),
      });

      return { clientSecret: session.client_secret ?? "" };
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
        ...(data.returnUrl && { return_url: validateReturnUrl(data.returnUrl, getRequest().url) }),
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

      // Resolve new price by lookup_key (or accept native price_xxx id).
      let newPrice;
      if (data.newPriceId.startsWith("price_")) {
        newPrice = await stripe.prices.retrieve(data.newPriceId);
      } else {
        const prices = await stripe.prices.list({ lookup_keys: [data.newPriceId] });
        if (!prices.data.length) throw new Error("Price not found");
        newPrice = prices.data[0];
      }

      if (!newPrice.active || newPrice.type !== "recurring" || newPrice.currency !== "brl")
        throw new Error("Preço indisponível");

      // Need the current subscription item id to swap its price.
      const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id as string);
      const itemId = current.items.data[0]?.id;
      if (!itemId) throw new Error("Subscription has no items");

      await stripe.subscriptions.update(sub.stripe_subscription_id as string, {
        items: [{ id: itemId, price: newPrice.id }],
        proration_behavior: "create_prorations",
        // If they cancelled-at-period-end and are now upgrading, clear it.
        cancel_at_period_end: false,
      });

      return { ok: true };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });
