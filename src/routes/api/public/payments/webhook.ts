import { createFileRoute } from "@tanstack/react-router";
import { processBillingWebhook } from "@/lib/billing-webhook";
export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const environment = new URL(request.url).searchParams.get("env");
        if (environment !== "sandbox" && environment !== "live")
          return new Response("Invalid environment", { status: 400 });
        try {
          await processBillingWebhook(request, environment);
          return Response.json({ received: true });
        } catch (error) {
          console.error("Billing webhook failed", error);
          return new Response("Webhook processing failed", { status: 500 });
        }
      },
    },
  },
});
