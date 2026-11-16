import { STATUS_LABELS } from "@/features/orders/order-queries";
import { dayInput, type ReportRow } from "./report";
export const STAGES = {
  open: "Em andamento",
  closed: "Conta encerrada",
  delivered: "Entregue, conta aberta",
  cancelled: "Cancelado",
  unconfirmed: "Encerrado sem entrega registrada",
};
export function orderCsv(rows: ReportRow[], timezone: string) {
  return [
    [
      "Data local",
      "Dia da operação",
      "Mesa",
      "Cliente",
      "Status",
      "Situação",
      "Valor dos itens selecionados",
      "Itens selecionados",
      "Motivo do cancelamento",
    ],
    ...rows.map((row) => [
      new Date(row.order.created_at).toLocaleString("pt-BR", { timeZone: timezone }),
      dayInput(row.day),
      row.order.table_label ?? "",
      row.order.customer_name ?? "",
      STATUS_LABELS[row.order.status],
      STAGES[row.stage],
      (row.cents / 100).toFixed(2),
      row.items.map((i) => `${i.quantity}x ${i.name_snapshot}`).join(" | "),
      row.order.cancellation_reason ?? "",
    ]),
  ];
}
