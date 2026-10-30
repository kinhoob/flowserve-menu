import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/auth-provider";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";

export const Route = createFileRoute("/checkout/return")({
  head: () => ({ meta: [{ title: "Pagamento confirmado — Flux Menu" }] }),
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id } = Route.useSearch();
  const { user } = useAuth();
  const paymentsReady = isPaymentsConfigured();

  // Poll the subscription row every 1.5s until status is active/trialing.
  // The webhook usually arrives within a few seconds; cap at ~30s.
  const { data: sub } = useQuery({
    queryKey: ["checkout-return-sub", user?.id],
    enabled: !!user?.id && !!session_id && paymentsReady,
    refetchInterval: (q) => {
      const data: any = q.state.data;
      if (data?.status === "active" || data?.status === "trialing") return false;
      return 1500;
    },
    queryFn: async () => {
      const env = getStripeEnvironment();
      const { data } = await supabase
        .from("subscriptions")
        .select("status, price_id, current_period_end")
        .eq("user_id", user!.id)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const isActive = sub?.status === "active" || sub?.status === "trialing";
  const waiting = !!session_id && !isActive;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.4)]">
          {waiting ? (
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          ) : (
            <CheckCircle2 className="h-7 w-7 text-primary" />
          )}
        </div>
        <h1 className="mt-5 font-display text-3xl tracking-tight">
          {!session_id
            ? "Tudo certo"
            : waiting
              ? "Confirmando seu pagamento…"
              : "Pagamento confirmado!"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {!session_id
            ? "Você pode retornar ao painel."
            : waiting
              ? "Aguardando confirmação do Stripe. Isso normalmente leva poucos segundos."
              : "Sua assinatura está ativa. Todos os recursos do plano foram liberados."}
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          Ir para o painel
        </Link>
      </div>
    </div>
  );
}
