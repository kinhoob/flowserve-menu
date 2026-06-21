import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

let _supabase: any = null;
function getSupabase(): any {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

// Map Stripe price lookup keys (or legacy ids) to internal plan_type values.
const PRICE_TO_PLAN: Record<string, string> = {
  basic_monthly: "basic",
  essential_monthly: "essential",
  pro_monthly: "pro",
};

function planTypeFromPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  if (PRICE_TO_PLAN[priceId]) return PRICE_TO_PLAN[priceId];
  if (priceId.startsWith("basic")) return "basic";
  if (priceId.startsWith("essential")) return "essential";
  if (priceId.startsWith("pro")) return "pro";
  return null;
}

// Statuses where the user has paid access (entitlement on).
const ENTITLED_STATUSES = new Set(["active", "trialing"]);
// Statuses that should block access immediately (per user requirement).
const BLOCKING_STATUSES = new Set([
  "past_due",
  "unpaid",
  "incomplete_expired",
  "paused",
]);

async function handleSubscriptionCreatedOrUpdated(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error("No userId in subscription metadata");
    return;
  }

  const item = subscription.items?.data?.[0];
  const priceId =
    item?.price?.lookup_key ||
    item?.price?.metadata?.lovable_external_id ||
    item?.price?.id;
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  const sb = getSupabase();
  await sb.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      product_id: productId,
      price_id: priceId,
      status: subscription.status,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );

  const plan = planTypeFromPriceId(priceId);

  // Entitlement on: active or trialing → grant the plan tier.
  if (plan && ENTITLED_STATUSES.has(subscription.status)) {
    await sb.from("profiles").update({ plan_type: plan }).eq("id", userId);
    return;
  }

  // Blocking statuses (past_due, unpaid, incomplete_expired, paused):
  // revoke access immediately by sending the user to trial-expired state.
  if (BLOCKING_STATUSES.has(subscription.status)) {
    await sb
      .from("profiles")
      .update({ plan_type: "trial", trial_ends_at: new Date(0).toISOString() })
      .eq("id", userId);
  }
  // "incomplete" and "canceled" (with future period_end) are left untouched:
  // - incomplete: pending first payment, no entitlement change yet
  // - canceled (with cancel_at_period_end): user keeps current plan until
  //   the customer.subscription.deleted event arrives at period end
}

async function handleSubscriptionDeleted(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  const sb = getSupabase();
  await sb
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);

  if (userId) {
    // Period ended → revoke access. Set trial_ends_at to epoch so the
    // trial-expired guard kicks in (no free trial reset on cancellation).
    await sb
      .from("profiles")
      .update({ plan_type: "trial", trial_ends_at: new Date(0).toISOString() })
      .eq("id", userId);
  }
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionCreatedOrUpdated(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object, env);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Webhook with invalid env:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
