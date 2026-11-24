import { validateEnvironment } from "@/lib/payment-policy";
import { processBillingWebhook } from "@/lib/billing-webhook";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const environment = new URL(request.url).searchParams.get("env");
        if (environment !== "sandbox" && environment !== "live")
          return new Response("Invalid environment", { status: 400 });
        try {
          await processBillingWebhook(request, validateEnvironment(environment));
          return Response.json({ received: true });
        } catch {
          console.error("Billing webhook processing failed");
          return new Response("Webhook processing failed", { status: 500 });
        }
      },
    },
  },
});
