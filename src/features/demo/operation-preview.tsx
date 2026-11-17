import { Link } from "@tanstack/react-router";
import { BellMascot } from "@/components/brand/bell-mascot";
import { cn } from "@/lib/utils";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChefHat,
  Bell,
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
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[20px] border border-[#27221b] bg-[#171614] shadow-[0_30px_90px_-30px_#000a]",
        compact && "text-[11px]",
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/7 bg-[#171614] px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-[#6b5b43]" />
        <span className="h-2 w-2 rounded-full bg-[#b8a586]" />
        <span className="h-2 w-2 rounded-full bg-[#e7bd73]" />
        <span className="mx-auto flex items-center gap-1.5 text-[10px] text-[#d5c3a4]">
          <QrCode className="h-3 w-3" /> fluxmenu · exemplo de operação
        </span>
        <MoreHorizontal className="h-4 w-4 text-[#b8a586]" />
      </div>
      <div className="flex">
        <aside
          className="hidden w-14 shrink-0 flex-col items-center gap-5 border-r border-white/7 py-5 sm:flex"
          aria-hidden
        >
          <div className="rounded-lg bg-primary/15 p-2 text-primary">
            <LayoutGrid className="h-4 w-4" />
          </div>
          <Receipt className="h-4 w-4 text-[#b8a586]" />
          <UtensilsCrossed className="h-4 w-4 text-[#b8a586]" />
          <QrCode className="h-4 w-4 text-[#b8a586]" />
        </aside>
        <div className={cn("min-w-0 flex-1", compact ? "p-4 sm:p-5" : "p-4 sm:p-7")}>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-medium uppercase tracking-[.2em] text-[#b8a586]">
                Seu restaurante
              </p>
              <h3 className="mt-1 font-display text-lg text-[#f4f4ed] sm:text-xl">
                O salão está no fluxo.
              </h3>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#6b5b43]/40 bg-[#27221b]/30 px-2 py-1 text-[9px] text-[#d5c3a4]">
              <span className="h-1 w-1 rounded-full bg-[#d5c3a4]" /> Exemplo
            </span>
          </div>
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              {
                label: "Novos pedidos",
                value: orders.filter((o) => o.status === "pending").length,
                icon: Receipt,
              },
              {
                label: "Prontos para entregar",
                value: orders.filter((o) => o.status === "ready").length,
                icon: ChefHat,
              },
              { label: "Chamados", value: 1, icon: Bell },
              { label: "Contas solicitadas", value: 1, icon: ArrowUpRight },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <Icon className="mb-2 h-3.5 w-3.5 text-[#D9AF50]" />
                <p className="text-[9px] text-white/65">{label}</p>
                <p className="mt-1 text-xl font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#D9AF50]/25 bg-[#D9AF50]/5 p-3">
            <BellMascot className="h-12 w-12 shrink-0" />
            <p className="rounded-xl rounded-bl-none bg-white/5 p-3 text-xs leading-5 text-white/85">
              Tem pedido pronto! Abra a fila e confira qual mesa está esperando.
              <span className="mt-1 block text-[9px] text-white/50">
                Campainha do Flux · exemplo de dica
              </span>
            </p>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <Link
              to="/demo"
              search={{ view: "menu" }}
              className="rounded-lg bg-[#D9AF50] px-3 py-2 text-xs font-medium text-black"
            >
              Ver cardápio
            </Link>
            <Link
              to="/demo"
              search={{ view: "operation" }}
              className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white"
            >
              Explorar demonstração
            </Link>
          </div>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-[#eeeae0]">Pedidos do salão</h4>
            <span className="text-[9px] text-[#b8a586]">Dados ilustrativos</span>
          </div>
          <div className="space-y-2">
            {orders.slice(0, compact ? 3 : orders.length).map((order) => {
              const status = DEMO_STATUS[order.status];
              return (
                <div
                  key={order.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-white/6 bg-[#171614] p-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#27221b] text-xs font-semibold text-[#e4dbc7]">
                    {order.table}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-[#e7ebe5]">
                      {order.itemsSummary ?? `${order.qty}× ${order.item}`}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-[9px] text-[#b8a586]">
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
                          : status.label
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
                    <Check className="h-4 w-4 text-[#d5c3a4]" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-white/6 pt-3 text-[9px] text-[#b8a586]">
            <ChefHat className="h-3.5 w-3.5 text-primary" />
            <span>Da escolha à cozinha. Da cozinha à mesa.</span>
            <ArrowDownLeft className="ml-auto h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
