import { paidPlanByLookupKey } from "@/features/billing/plan-matrix";
import { createBillingDatabase } from "./billing-database.server";
import { z } from "zod";
import { createStripeClient, verifyWebhook, type StripeEnv } from "./stripe.server";

const referenceSchema = z.union([z.string(), z.object({ id: z.string() })]);
const invoiceSchema = z.object({
  parent: z
    .object({ subscription_details: z.object({ subscription: referenceSchema }).nullable() })
    .nullish(),
  subscription: referenceSchema.nullish(),
});
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
  const isInvoice = ["invoice.paid", "invoice.payment_failed"].includes(event.type);
  const isSubscription = [
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.resumed",
    "customer.subscription.pending_update_applied",
    "customer.subscription.pending_update_expired",
  ].includes(event.type);
  if (!isSubscription && !isInvoice) return;

  const getId = (ref: z.infer<typeof referenceSchema>) => (typeof ref === "string" ? ref : ref.id);
  let id: string;
  if (isInvoice) {
    const invoice = invoiceSchema.parse(event.data.object);
    const ref = invoice.parent?.subscription_details?.subscription ?? invoice.subscription;
    if (!ref) return;
    id = getId(ref);
  } else {
    id = z.object({ id: z.string() }).parse(event.data.object).id;
  }
  const sb = createBillingDatabase();
  const { data: generation, error: beginError } = await sb.rpc("begin_billing_reconciliation", {
    p_environment: environment,
    p_subscription_id: id,
  });
  if (beginError) throw beginError;
  if (!generation) throw new Error("Reconciliação da assinatura indisponível");
  const snapshot = await createStripeClient(environment).subscriptions.retrieve(id);
  if (snapshot.id !== id || snapshot.livemode !== (environment === "live"))
    throw new Error("Assinatura Stripe divergente");
  const subscription = subscriptionSchema.parse(snapshot);
  if (!subscription.metadata?.userId) throw new Error("Assinatura sem usuário vinculado");
  const item = subscription.items?.data?.[0];
  const price = item?.price?.lookup_key;
  const plan = paidPlanByLookupKey(price);
  if (!plan && ["active", "trialing"].includes(subscription.status))
    throw new Error("Preço sem plano cadastrado");
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
      status: subscription.status,
      reconciliation_generation: generation,
      current_period_start: iso(item?.current_period_start ?? subscription.current_period_start),
      current_period_end: iso(item?.current_period_end ?? subscription.current_period_end),
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      plan_type: plan ?? null,
    },
  });
  if (error) throw error;
}
