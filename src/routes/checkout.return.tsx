import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/checkout/return")({
  head: () => ({ meta: [{ title: "Pagamento confirmado — Flux" }] }),
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id } = Route.useSearch();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.4)]">
          <CheckCircle2 className="h-7 w-7 text-primary" />
        </div>
        <h1 className="mt-5 font-display text-3xl tracking-tight">
          {session_id ? "Pagamento confirmado!" : "Tudo certo"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {session_id
            ? "Sua assinatura foi ativada. Em instantes seu plano estará liberado no painel."
            : "Você pode retornar ao painel."}
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
