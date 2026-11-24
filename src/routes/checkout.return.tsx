import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/use-auth";
import { verifyCheckoutSubscription } from "@/lib/payments.functions";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/checkout/return")({
  head: () => ({ meta: [{ title: "Status do pagamento — Flux Menu" }] }),
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id } = Route.useSearch();
  const { user } = useAuth();
  const paymentsReady = isPaymentsConfigured();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!session_id) return;
    const timer = setTimeout(() => setTimedOut(true), 30000);
    return () => clearTimeout(timer);
  }, [session_id]);

  const status = useQuery({
    queryKey: ["checkout-return-sub", user?.id, session_id],
    enabled: !!user?.id && !!session_id && paymentsReady,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (query.state.data || timedOut ? false : 3000),
    queryFn: () =>
      verifyCheckoutSubscription({
        data: { sessionId: session_id!, environment: getStripeEnvironment() },
      }),
  });

  const isActive = status.data === true;
  const waiting =
    !!session_id && !!user?.id && paymentsReady && !isActive && !status.isError && !timedOut;

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
              : isActive
                ? "Pagamento confirmado!"
                : "Assinatura pendente"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {!session_id
            ? "Você pode retornar ao painel."
            : waiting
              ? "Aguardando confirmação do Stripe. Isso normalmente leva poucos segundos."
              : isActive
                ? "A confirmação da sua assinatura foi recebida."
                : "Confira o estado da sua assinatura nas configurações."}
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
