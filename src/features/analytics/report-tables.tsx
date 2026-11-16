import { STAGES, orderCsv } from "./report-export";
import { useState } from "react";
import { downloadCsv } from "@/features/menu/catalog-csv";
import { STATUS_LABELS } from "@/features/orders/order-queries";
import { formatPrice } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dayLabel, type RestaurantReport, type ReportRow } from "./report";
export function ReportProducts({
  report,
  currency,
  filename,
}: {
  report: RestaurantReport;
  currency: string;
  filename: string;
}) {
  const [sort, setSort] = useState("quantity");
  const [limit, setLimit] = useState(10);
  const products = [...report.current.products].sort((a, b) =>
    sort === "cents"
      ? b.cents - a.cents
      : sort === "cancelled"
        ? b.cancelled - a.cancelled
        : b.quantity - a.quantity,
  );
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-display text-xl">Resultado por produto</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Vendas entregues e demanda cancelada. Preço histórico com adicionais; custos não estão
            cadastrados para calcular lucro.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Ordenar ranking de produtos"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setLimit(10);
            }}
            className="rounded-xl border border-border bg-background p-2 text-xs"
          >
            <option value="quantity">Mais vendidos</option>
            <option value="cents">Maior valor vendido</option>
            <option value="cancelled">Mais cancelados</option>
          </select>
          <button
            disabled={!products.length}
            onClick={() =>
              downloadCsv(`${filename}-produtos.csv`, [
                [
                  "Produto",
                  "Categoria",
                  "Unidades entregues",
                  "Valor dos itens entregues",
                  "Unidades canceladas",
                  "Unidades pedidas",
                  "Percentual das unidades canceladas",
                ],
                ...products.map((p) => [
                  p.name,
                  p.category,
                  p.quantity,
                  (p.cents / 100).toFixed(2),
                  p.cancelled,
                  p.demand,
                  p.demand
                    ? ((p.cancelled / p.demand) * 100).toLocaleString("pt-BR", {
                        maximumFractionDigits: 1,
                        minimumFractionDigits: 1,
                      })
                    : "0",
                ]),
              ])
            }
            className="rounded-xl border border-border px-3 py-2 text-xs disabled:opacity-40"
          >
            Exportar ranking completo
          </button>
        </div>
      </div>
      {products.length ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-y border-border text-xs text-muted-foreground">
                <tr>
                  {[
                    "Produto",
                    "Entregues",
                    "Vendas de itens",
                    "Participação nas vendas",
                    "Cancelados",
                  ].map((h) => (
                    <th key={h} className="px-5 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.slice(0, limit).map((p) => (
                  <tr key={p.id} className="border-b border-border/60">
                    <td className="px-5 py-3">
                      <p>{p.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{p.category}</p>
                    </td>
                    <td className="px-5 py-3">{p.quantity} un.</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {formatPrice(p.cents / 100, currency)}
                    </td>
                    <td className="px-5 py-3">
                      {report.current.cents
                        ? ((p.cents / report.current.cents) * 100).toLocaleString("pt-BR", {
                            maximumFractionDigits: 1,
                            minimumFractionDigits: 1,
                          })
                        : "0"}
                      %
                    </td>
                    <td className="px-5 py-3">
                      <p>{p.cancelled} un.</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p.demand ? ((p.cancelled / p.demand) * 100).toFixed(1) : "0"}% das unidades
                        pedidas
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {products.length > limit && (
            <button
              onClick={() => setLimit((v) => v + 10)}
              className="m-5 rounded-xl border border-border px-4 py-2 text-xs"
            >
              Mostrar mais produtos ({limit} de {products.length})
            </button>
          )}
        </>
      ) : (
        <p className="p-6 text-sm text-muted-foreground">
          Nenhum item encontrado para os filtros selecionados.
        </p>
      )}
      {report.current.cancelled > 0 && (
        <div className="border-t border-border p-5">
          <h3 className="text-sm font-medium">Motivos dos cancelamentos</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Valor dos itens cancelados: {formatPrice(report.current.cancelledCents / 100, currency)}
            . Representa demanda cancelada, sem comprovar prejuízo.
          </p>
          <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
            {report.current.reasons.slice(0, 5).map(([reason, count]) => (
              <li key={reason} className="flex items-start justify-between gap-3">
                <span className="break-words">{reason}</span>
                <span>{count} pedido(s)</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
export function ReportHistory({
  report,
  currency,
  timezone,
  filename,
}: {
  report: RestaurantReport;
  currency: string;
  timezone: string;
  filename: string;
}) {
  const [stage, setStage] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ReportRow | null>(null);
  const rows = report.current.rows.filter((row) => stage === "all" || row.stage === stage);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 20) - 1));
  const date = (value: string) =>
    new Date(value).toLocaleString("pt-BR", {
      timeZone: timezone,
      dateStyle: "short",
      timeStyle: "short",
    });
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-display text-xl">Histórico para conferir os números</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Esta lista respeita os filtros do relatório. O filtro de situação abaixo altera apenas a
            lista e sua exportação.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Filtrar situação no histórico"
            value={stage}
            onChange={(e) => {
              setStage(e.target.value);
              setPage(0);
            }}
            className="rounded-xl border border-border bg-background p-2 text-xs"
          >
            <option value="all">Todas as situações</option>
            {Object.entries(STAGES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            disabled={!rows.length}
            onClick={() => downloadCsv(`${filename}-historico.csv`, orderCsv(rows, timezone))}
            className="rounded-xl border border-border px-3 py-2 text-xs disabled:opacity-40"
          >
            Exportar esta lista
          </button>
        </div>
      </div>
      {rows.length ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-y border-border text-xs text-muted-foreground">
                <tr>
                  {[
                    "Mesa / cliente",
                    "Data local",
                    "Dia de operação",
                    "Status",
                    "Situação",
                    "Itens selecionados",
                  ].map((h) => (
                    <th key={h} className="px-5 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(currentPage * 20, currentPage * 20 + 20).map((row) => (
                  <tr
                    key={row.order.id}
                    onClick={() => setSelected(row)}
                    className="cursor-pointer border-b border-border/60 transition hover:bg-background/60"
                  >
                    <td className="px-5 py-3">
                      <button
                        className="text-left underline decoration-primary/30 underline-offset-4"
                        aria-label={`Ver pedido de ${row.order.table_label ?? "balcão"}, ${date(row.order.created_at)}`}
                      >
                        {row.order.table_label ?? "Balcão"}
                      </button>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.order.customer_name ?? "Sem nome"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-xs">
                      {date(row.order.created_at)}
                    </td>
                    <td className="px-5 py-3 text-xs">{dayLabel(row.day)}</td>
                    <td className="px-5 py-3 text-xs">{STATUS_LABELS[row.order.status]}</td>
                    <td className="px-5 py-3 text-xs">{STAGES[row.stage]}</td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {formatPrice(row.cents / 100, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 p-4 text-xs text-muted-foreground">
            <span>
              {rows.length} pedidos · Página {currentPage + 1} de {Math.ceil(rows.length / 20)}
            </span>
            <div className="flex gap-3">
              <button
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
                className="rounded-lg border border-border px-3 py-2 disabled:opacity-30"
              >
                Anterior
              </button>
              <button
                disabled={(currentPage + 1) * 20 >= rows.length}
                onClick={() => setPage(currentPage + 1)}
                className="rounded-lg border border-border px-3 py-2 disabled:opacity-30"
              >
                Próxima
              </button>
            </div>
          </div>
        </>
      ) : (
        <p className="p-6 text-sm text-muted-foreground">Nenhum pedido encontrado nesta seleção.</p>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{selected?.order.table_label ?? "Pedido"}</DialogTitle>
            <DialogDescription>
              Pedido completo. Os indicadores do relatório e a lista consideram apenas os itens que
              correspondem aos filtros.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                {date(selected.order.created_at)} · {selected.order.customer_name ?? "Sem nome"} ·{" "}
                {STATUS_LABELS[selected.order.status]}
              </p>
              {selected.order.cancellation_reason && (
                <p className="rounded-xl border border-amber-400/30 p-3">
                  Motivo: {selected.order.cancellation_reason}
                </p>
              )}
              <ul className="space-y-3">
                {selected.order.order_items.map((i) => (
                  <li
                    key={i.id}
                    className="flex justify-between gap-3 rounded-xl border border-border p-3"
                  >
                    <div>
                      <p>
                        {i.quantity}× {i.name_snapshot}
                      </p>
                      {i.notes && <p className="mt-1 text-xs text-muted-foreground">{i.notes}</p>}
                      {Array.isArray(i.modifiers_snapshot) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {i.modifiers_snapshot
                            .flatMap((m) =>
                              m &&
                              typeof m === "object" &&
                              !Array.isArray(m) &&
                              typeof m.name === "string"
                                ? [m.name]
                                : [],
                            )
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0">
                      {formatPrice(Number(i.price_snapshot) * i.quantity, currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <dl className="space-y-2 border-t border-border pt-4">
                <div className="flex justify-between">
                  <dt>Itens incluídos na seleção</dt>
                  <dd>{formatPrice(selected.cents / 100, currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Subtotal completo registrado</dt>
                  <dd>{formatPrice(Number(selected.order.subtotal), currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Serviço e couvert registrados</dt>
                  <dd>
                    {formatPrice(
                      Number(selected.order.service_fee ?? 0) +
                        Number(selected.order.cover_charge ?? 0),
                      currency,
                    )}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">
                Valores não comprovam recebimento de pagamento.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
