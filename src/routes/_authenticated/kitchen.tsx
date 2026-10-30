import { FeatureLocked } from "@/features/billing/trial-guard";
import { canAccess, useTrialStatus } from "@/features/billing/trial-status";
import {
  STATUS_FLOW,
  STATUS_LABELS,
  useArchiveServedOrders,
  useOrders,
  useUpdateOrderStatus,
  type Order,
  type OrderStatus,
} from "@/features/orders/order-queries";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { StaffPicker } from "@/features/staff/staff-picker";
import { supabase } from "@/integrations/supabase/client";
import { getErrorDetails } from "@/lib/errors";
import { formatPrice } from "@/lib/format";
import { playChime } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  ChefHat,
  Clock,
  Loader2,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/kitchen")({
  head: () => ({ meta: [{ title: "Cozinha — Flux Menu" }] }),
  component: KitchenPage,
});

const COLUMN_STYLES: Record<OrderStatus, string> = {
  pending: "from-[oklch(0.78_0.13_84_/_0.18)] to-transparent",
  accepted: "from-[oklch(0.65_0.18_250_/_0.15)] to-transparent",
  preparing: "from-[oklch(0.7_0.18_55_/_0.15)] to-transparent",
  ready: "from-[oklch(0.7_0.18_150_/_0.15)] to-transparent",
  served: "from-[oklch(0.5_0.02_60_/_0.15)] to-transparent",
  cancelled: "from-[oklch(0.5_0.18_25_/_0.12)] to-transparent",
};

function elapsed(ts: string) {
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

function KitchenPage() {
  const qc = useQueryClient();
  const { data: restaurant } = useRestaurant();
  const { data: trial } = useTrialStatus();
  const { data: orders, isLoading } = useOrders(restaurant?.id);
  const update = useUpdateOrderStatus(restaurant?.id);
  const archive = useArchiveServedOrders(restaurant?.id);
  const [pendingDeliver, setPendingDeliver] = useState<string | null>(null);

  async function markServed(id: string, deliveredByName: string) {
    const { error } = await supabase
      .from("orders")
      .update({
        status: "served",
        delivered_by_name: deliveredByName,
        delivered_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["orders", restaurant?.id] });
    toast.success(`Entregue por ${deliveredByName}`);
  }

  function advance(id: string, next: OrderStatus) {
    if (next === "served") {
      setPendingDeliver(id);
    } else {
      update.mutate({ id, status: next });
    }
  }

  const [showServed, setShowServed] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [scope, setScope] = useState<"all" | "food" | "drink">("all");
  const prevPending = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  const scopedOrders = useMemo(() => {
    if (scope === "all") return orders ?? [];
    return (orders ?? [])
      .map((o) => {
        const items = o.order_items.filter((it) => {
          const kind = it?.menu_items?.categories?.kind ?? "food";
          return kind === scope;
        });
        return { ...o, order_items: items };
      })
      .filter((o) => o.order_items.length > 0);
  }, [orders, scope]);

  const columns = useMemo(() => {
    const visible = STATUS_FLOW.filter((s) => (showServed ? true : s !== "served"));
    return visible.map((status) => ({
      status,
      orders: scopedOrders.filter((o) => o.status === status),
    }));
  }, [scopedOrders, showServed]);

  const totalActive = scopedOrders.filter(
    (o) => o.status !== "served" && o.status !== "cancelled",
  ).length;

  useEffect(() => {
    const pending = new Set((orders ?? []).filter((o) => o.status === "pending").map((o) => o.id));
    if (initialized.current && soundOn) {
      for (const id of pending) {
        if (!prevPending.current.has(id)) {
          playChime();
          break;
        }
      }
    }
    prevPending.current = pending;
    if (orders) initialized.current = true;
  }, [orders, soundOn]);

  if (trial && !canAccess(trial, "kitchen")) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <FeatureLocked feature="kitchen" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-primary">Operação ao vivo</p>
          <h1 className="mt-2 font-sans font-semibold text-4xl tracking-tight">
            Painel da <span className="text-gradient-gold italic">cozinha</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {totalActive} {totalActive === 1 ? "pedido ativo" : "pedidos ativos"} · atualizado em
            tempo real
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-border bg-surface p-0.5 text-xs">
            {[
              { k: "all" as const, l: "Tudo" },
              { k: "food" as const, l: "Cozinha" },
              { k: "drink" as const, l: "Bar" },
            ].map(({ k, l }) => (
              <button
                key={k}
                onClick={() => setScope(k)}
                className={
                  "rounded-lg px-3 py-1.5 transition " +
                  (scope === k
                    ? "bg-gold-soft text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {l}
              </button>
            ))}
          </div>
          <button
            onClick={() => setSoundOn((v) => !v)}
            title={soundOn ? "Som ativo" : "Som mudo"}
            className="rounded-xl border border-border bg-surface p-2.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setShowServed((v) => !v)}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground"
          >
            {showServed ? "Ocultar entregues" : "Mostrar entregues"}
          </button>
          <button
            onClick={async () => {
              try {
                const n = await archive.mutateAsync();
                toast.success(n > 0 ? `${n} pedido(s) arquivado(s)` : "Nada para arquivar");
              } catch (caught: unknown) {
                const e = getErrorDetails(caught);
                toast.error(e.message ?? "Erro ao arquivar");
              }
            }}
            disabled={archive.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground disabled:opacity-60"
          >
            <Archive className="h-4 w-4" /> Arquivar concluídos
          </button>
          <span className="inline-flex items-center gap-2 rounded-full bg-gold-soft px-3 py-1.5 text-xs text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Ao vivo
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div
          className={cn(
            "grid gap-4",
            showServed ? "lg:grid-cols-5" : "lg:grid-cols-4",
            "sm:grid-cols-2",
          )}
        >
          {columns.map((col) => (
            <KitchenColumn
              key={col.status}
              status={col.status}
              orders={col.orders}
              onAdvance={(id, next) => advance(id, next)}
              onCancel={(id) => update.mutate({ id, status: "cancelled" })}
              currency={restaurant?.currency ?? "BRL"}
            />
          ))}
        </div>
      )}
      <AnimatePresence>
        {pendingDeliver && restaurant && (
          <StaffPicker
            restaurantId={restaurant.id}
            title="Quem está entregando?"
            onSelect={async (name) => {
              const id = pendingDeliver;
              setPendingDeliver(null);
              if (id) await markServed(id, name);
            }}
            onClose={() => setPendingDeliver(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function KitchenColumn({
  status,
  orders,
  onAdvance,
  onCancel,
  currency,
}: {
  status: OrderStatus;
  orders: Order[];
  onAdvance: (id: string, next: OrderStatus) => void;
  onCancel: (id: string) => void;
  currency: string;
}) {
  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(status) + 1];

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border border-border bg-gradient-to-b p-3",
        COLUMN_STYLES[status],
      )}
    >
      <div className="mb-3 flex items-center justify-between px-2 pt-1">
        <h3 className="font-sans font-semibold text-lg tracking-tight">{STATUS_LABELS[status]}</h3>
        <span className="rounded-full bg-background/60 px-2.5 py-0.5 text-xs text-muted-foreground ring-1 ring-border">
          {orders.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3">
        <AnimatePresence mode="popLayout">
          {orders.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/60 py-10 text-xs text-muted-foreground"
            >
              Sem pedidos
            </motion.div>
          ) : (
            orders.map((o) => (
              <motion.div
                key={o.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, x: 20 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="group rounded-xl border border-border bg-background/80 p-4 backdrop-blur transition hover:border-[oklch(0.78_0.13_84_/_0.4)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-sans font-semibold text-base tracking-tight">
                      {o.table_label ? `Mesa ${o.table_label}` : "Balcão"}
                    </div>
                    {o.customer_name && (
                      <div className="text-xs text-muted-foreground">{o.customer_name}</div>
                    )}
                    {o.created_by_name && (
                      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-primary/80">
                        Lançado por: {o.created_by_name}
                      </div>
                    )}
                    {o.delivered_by_name && (
                      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-emerald-400/90">
                        Entregue por: {o.delivered_by_name}
                        {o.delivered_at && (
                          <>
                            {" "}
                            ·{" "}
                            {new Date(o.delivered_at).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" /> {elapsed(o.created_at)}
                  </span>
                </div>

                <ul className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
                  {o.order_items.map((it) => (
                    <li key={it.id} className="flex flex-col gap-1">
                      <div className="flex justify-between gap-2">
                        <span className="text-foreground">
                          <span className="font-medium text-primary">{it.quantity}×</span>{" "}
                          {it.name_snapshot}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatPrice(Number(it.price_snapshot) * it.quantity, currency)}
                        </span>
                      </div>
                      {it.notes && (
                        <div className="rounded-md border border-[oklch(0.78_0.16_84_/_0.45)] bg-[oklch(0.92_0.12_92_/_0.18)] px-2.5 py-1.5 text-[12px] font-semibold text-[oklch(0.88_0.16_88)]">
                          <span className="mr-1 text-[10px] uppercase tracking-wider text-[oklch(0.78_0.14_84)]">
                            Obs:
                          </span>
                          {it.notes}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>

                {o.notes && (
                  <p className="mt-2 rounded-md bg-surface px-2 py-1.5 text-xs italic text-muted-foreground">
                    “{o.notes}”
                  </p>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <span className="font-sans font-semibold text-lg tracking-tight">
                    {formatPrice(Number(o.subtotal), currency)}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {status !== "served" && status !== "cancelled" && (
                      <button
                        onClick={() => onCancel(o.id)}
                        title="Cancelar"
                        className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-border bg-background px-3 text-muted-foreground transition hover:border-destructive/40 hover:text-destructive"
                      >
                        <XCircle className="h-5 w-5" />
                      </button>
                    )}
                    {nextStatus && (
                      <button
                        onClick={() => onAdvance(o.id, nextStatus)}
                        className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95"
                      >
                        {nextStatus === "served" ? (
                          <>
                            <CheckCircle2 className="h-4 w-4" /> Entregar
                          </>
                        ) : nextStatus === "preparing" ? (
                          <>
                            <ChefHat className="h-4 w-4" /> Preparar
                          </>
                        ) : (
                          <>
                            {STATUS_LABELS[nextStatus]} <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
