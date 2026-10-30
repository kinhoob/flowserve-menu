import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { verifyWebhook, type StripeEnv } from "./stripe.server";

const referenceSchema = z.union([z.string(), z.object({ id: z.string() })]);
const subscriptionSchema = z.object({
  id: z.string(),
  metadata: z.object({ userId: z.string().optional() }),
  customer: referenceSchema,
  status: z.string(),
  current_period_start: z.number().optional(),
  current_period_end: z.number().optional(),
  cancel_at_period_end: z.boolean().optional(),
  items: z
    .object({
      data: z.array(
        z.object({
          current_period_start: z.number().optional(),
          current_period_end: z.number().optional(),
          price: z.object({
            id: z.string().optional(),
            lookup_key: z.string().nullish(),
            metadata: z.object({ lovable_external_id: z.string().optional() }).optional(),
            product: referenceSchema.optional(),
          }),
        }),
      ),
    })
    .optional(),
});

export async function processBillingWebhook(
  request: Request,
  environment: StripeEnv,
): Promise<void> {
  const event = await verifyWebhook(request, environment);
  if (
    ![
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ].includes(event.type)
  )
    return;
  const subscription = subscriptionSchema.parse(event.data.object);
  if (!subscription.metadata?.userId) throw new Error("Assinatura sem usuário vinculado");
  const item = subscription.items?.data?.[0];
  const price = item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id;
  const plans: Record<string, string> = {
    basic_monthly: "basic",
    essential_monthly: "essential",
    pro_monthly: "pro",
  };
  const plan = price ? plans[price] : undefined;
  if (!plan && ["active", "trialing"].includes(subscription.status))
    throw new Error("Preço sem plano cadastrado");
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const iso = (value: number | undefined) => (value ? new Date(value * 1000).toISOString() : null);
  const { error } = await sb.rpc("apply_billing_event", {
    p_event_id: event.id,
    p_created: event.created,
    p_environment: environment,
    p_subscription: {
      user_id: subscription.metadata.userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
      price_id: price ?? item?.price?.id,
      product_id:
        typeof item?.price?.product === "string" ? item.price.product : item?.price?.product?.id,
      status: event.type === "customer.subscription.deleted" ? "canceled" : subscription.status,
      current_period_start: iso(item?.current_period_start ?? subscription.current_period_start),
      current_period_end: iso(item?.current_period_end ?? subscription.current_period_end),
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      plan_type: plan ?? null,
    },
  });
  if (error) throw error;
}
