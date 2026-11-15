import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChefHat,
  CircleDot,
  Clock3,
  LayoutGrid,
  MoreHorizontal,
  QrCode,
  Receipt,
  UtensilsCrossed,
} from "lucide-react";
import { DEMO_ORDERS, DEMO_STATUS, type DemoOrder } from "./demo-data";
export function OperationPreview({
  orders = DEMO_ORDERS,
  compact = false,
  onAdvance,
}: {
  orders?: DemoOrder[];
  compact?: boolean;
  onAdvance?: (id: string) => void;
}) {
  const active = orders.filter((order) => order.status !== "served");
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[20px] border border-[#39423b] bg-[#191e1b] shadow-[0_30px_90px_-30px_#000a]",
        compact && "text-[11px]",
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/7 bg-[#1f2721] px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-[#637b69]" />
        <span className="h-2 w-2 rounded-full bg-[#a2aa78]" />
        <span className="h-2 w-2 rounded-full bg-[#e7bd73]" />
        <span className="mx-auto flex items-center gap-1.5 text-[10px] text-[#a0ada3]">
          <QrCode className="h-3 w-3" /> fluxmenu · exemplo de operação
        </span>
        <MoreHorizontal className="h-4 w-4 text-[#738077]" />
      </div>
      <div className="flex">
        <aside
          className="hidden w-14 shrink-0 flex-col items-center gap-5 border-r border-white/7 py-5 sm:flex"
          aria-hidden
        >
          <div className="rounded-lg bg-primary/15 p-2 text-primary">
            <LayoutGrid className="h-4 w-4" />
          </div>
          <Receipt className="h-4 w-4 text-[#708275]" />
          <UtensilsCrossed className="h-4 w-4 text-[#708275]" />
          <QrCode className="h-4 w-4 text-[#708275]" />
        </aside>
        <div className={cn("min-w-0 flex-1", compact ? "p-4 sm:p-5" : "p-4 sm:p-7")}>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-medium uppercase tracking-[.2em] text-[#96a69a]">
                Seu restaurante
              </p>
              <h3 className="mt-1 font-display text-lg text-[#f4f4ed] sm:text-xl">
                O salão está no fluxo.
              </h3>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#56715b]/40 bg-[#314e38]/30 px-2 py-1 text-[9px] text-[#b0cfb4]">
              <span className="h-1 w-1 rounded-full bg-[#a7cfae]" /> Exemplo
            </span>
          </div>
          <div className="mb-5 grid grid-cols-3 gap-2">
            {[
              { label: "Pedidos", value: String(orders.length), icon: Receipt },
              {
                label: "Em operação",
                value: String(active.length).padStart(2, "0"),
                icon: CircleDot,
              },
              {
                label: "Vendas simuladas",
                value: formatPrice(
                  orders.reduce((sum, order) => sum + order.amount, 0),
                  "BRL",
                ),
                icon: ArrowUpRight,
              },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="rounded-xl border border-white/6 bg-[#222a24] p-2.5 sm:p-3.5"
              >
                <div className="mb-2 flex items-center justify-between gap-1 text-[9px] text-[#a1afa4]">
                  <span>{label}</span>
                  <Icon className="hidden h-3 w-3 sm:block" />
                </div>
                <p className="font-display text-base tracking-tight text-[#faf9f2] sm:text-xl">
                  {value}
                </p>
              </div>
            ))}
          </div>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-[#eeeae0]">Pedidos do salão</h4>
            <span className="text-[9px] text-[#93a398]">Dados ilustrativos</span>
          </div>
          <div className="space-y-2">
            {orders.slice(0, compact ? 3 : orders.length).map((order) => {
              const status = DEMO_STATUS[order.status];
              return (
                <div
                  key={order.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-white/6 bg-[#1d241f] p-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2d3830] text-xs font-semibold text-[#e4dbc7]">
                    {order.table}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-[#e7ebe5]">
                      {order.itemsSummary ?? `${order.qty}× ${order.item}`}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-[9px] text-[#839b8b]">
                      <Clock3 className="h-2.5 w-2.5" />#{order.id} · {order.time}
                    </p>
                  </div>
                  <span
                    className="rounded-full px-2 py-1 text-[9px]"
                    style={{ color: status.color, backgroundColor: status.color + "12" }}
                  >
                    {compact
                      ? order.status === "pending"
                        ? "Novo"
                        : order.status === "preparing"
                          ? "Em preparo"
                          : "Pronto"
                      : status.label}
                  </span>
                  {onAdvance && order.status !== "served" && (
                    <button
                      onClick={() => onAdvance(order.id)}
                      className="w-full rounded-lg border border-border px-3 py-2 text-[11px] text-primary transition hover:bg-primary/10 sm:w-auto"
                      aria-label={`${status.action} do pedido ${order.id}`}
                    >
                      {status.action}
                      <ArrowUpRight className="ml-1 inline h-3 w-3" />
                    </button>
                  )}
                  {!compact && order.status === "served" && (
                    <Check className="h-4 w-4 text-[#9fc7a9]" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-white/6 pt-3 text-[9px] text-[#91a695]">
            <ChefHat className="h-3.5 w-3.5 text-primary" />
            <span>Da escolha à cozinha. Da cozinha à mesa.</span>
            <ArrowDownLeft className="ml-auto h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
