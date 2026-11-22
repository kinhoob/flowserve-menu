import type { RestaurantReport } from "./report";
import { formatPrice } from "@/lib/format";
export function ReportQuickAnswers({
  report,
  currency,
}: {
  report: RestaurantReport;
  currency: string;
}) {
  const c = report.current;
  const top = c.products[0];
  return (
    <section
      aria-label="Respostas rápidas do restaurante"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm text-muted-foreground">Mais vendido em quantidade</p>
        <p className="mt-2 text-xl font-semibold">{top?.name ?? "Sem vendas no período"}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {top ? top.quantity + " unidade(s) entregues" : "As respostas aparecem com seus pedidos."}
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm text-muted-foreground">O que foi cancelado?</p>
        <p className="mt-2 text-xl font-semibold">{c.cancelled} pedido(s)</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {c.reasons[0] ? "Motivo principal: " + c.reasons[0][0] : "Nenhum motivo registrado"}
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm text-muted-foreground">Vendas de itens entregues</p>
        <p className="mt-2 text-xl font-semibold">{formatPrice(c.cents / 100, currency)}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Contas encerradas não comprovam pagamento.
        </p>
      </div>
    </section>
  );
}
