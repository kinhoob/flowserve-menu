import { findTableForRecord } from "@/features/tables/table-identity";
import type { VenueTable } from "@/features/tables/table-queries";
import { SyncStatus } from "@/features/orders/sync-status";
import { QueryError, DashboardSkeleton } from "@/features/dashboard/query-feedback";
import { releaseTable } from "@/features/tables/release-table";
import { TableServicePanel } from "@/features/tables/table-service-panel";
import { FeatureLocked } from "@/features/billing/trial-guard";
import { canAccess, canContinueService, useTrialStatus } from "@/features/billing/trial-status";
import { SplitBillDialog } from "@/features/experience/split-bill-dialog";
import { useOrders, type Order } from "@/features/orders/order-queries";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { useTables } from "@/features/tables/table-queries";
import { QuickOrderModal } from "@/features/waiter/quick-order-dialog";
import { useResolveWaiterCall, useWaiterCalls } from "@/features/waiter/waiter-queries";
import { formatPrice } from "@/lib/format";
import { normalizeTableLabel } from "@/lib/operations";
import { playChime } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, DollarSign, Loader2, Plus, Receipt, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

// A table is "ocupada" enquanto houver qualquer pedido não-arquivado e não cancelado.
// O status "served" ainda conta como ocupado — só sai com Finalizar e liberar (archived=true).
const ACTIVE: Order["status"][] = ["pending", "accepted", "preparing", "ready", "served"];

export const Route = createFileRoute("/_authenticated/waiter")({
  head: () => ({ meta: [{ title: "Garçom — Flux Menu" }] }),
  component: WaiterPage,
});

function WaiterPage() {
  const { data: restaurant } = useRestaurant();
  const tablesQuery = useTables(restaurant?.id);
  const { data: tables } = tablesQuery;
  const ordersQuery = useOrders(restaurant?.id);
  const { data: orders } = ordersQuery;
  const { data: trial } = useTrialStatus();
  const { data: waiterCalls = [] } = useWaiterCalls(restaurant?.id);
  const resolveCall = useResolveWaiterCall(restaurant?.id);
  const [openTable, setOpenTable] = useState<string | null>(null);
  const [serviceTable, setServiceTable] = useState<{ id: string; label: string } | null>(null);
  const [billTable, setBillTable] = useState<VenueTable | null>(null);
  const [ready, setReady] = useState<{ label: string; id: string } | null>(null);
  const seenReady = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  // Normaliza "Mesa 1", "Mesa Mesa 1", "  Mesa   1  " → "1"

  // Calls "pedir conta" e "chamar garçom" por table_label (qualquer chamado não resolvido)
  const callsByLabel = useMemo(() => {
    const m = new Map<string, { id: string; created_at: string; kind: "bill" | "call" }[]>();
    for (const c of waiterCalls) {
      if (c.resolved) continue;
      const kind = (c.kind === "bill" ? "bill" : "call") as "bill" | "call";
      const lbl = findTableForRecord(tables ?? [], c)?.id;
      if (!lbl) continue;
      const arr = m.get(lbl) ?? [];
      arr.push({ id: c.id, created_at: c.created_at, kind });
      m.set(lbl, arr);
    }
    return m;
  }, [waiterCalls, tables]);

  const billCallsByLabel = useMemo(() => {
    const m = new Map<string, { id: string; created_at: string }>();
    for (const [lbl, arr] of callsByLabel) {
      const bill = arr.find((c) => c.kind === "bill");
      if (bill) m.set(lbl, { id: bill.id, created_at: bill.created_at });
    }
    return m;
  }, [callsByLabel]);

  // Occupancy: any active order tied to the table_label (realtime via useOrders)
  const occupied = useMemo(() => {
    const s = new Set<string>();
    for (const o of orders ?? []) {
      if (ACTIVE.includes(o.status) && o.table_label) {
        const key = findTableForRecord(tables ?? [], o)?.id;
        if (!key) continue;
        s.add(key);
      }
    }
    return s;
  }, [orders, tables]);

  // Detect newly-ready orders
  useEffect(() => {
    const readyOrders = (orders ?? []).filter((o) => o.status === "ready");
    if (initialized.current && canAccess(trial, "kitchenSound")) {
      for (const o of readyOrders) {
        if (!seenReady.current.has(o.id)) {
          seenReady.current.add(o.id);
          playChime();
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            try {
              navigator.vibrate([200, 100, 200]);
            } catch {
              /* Optional local state is best effort. */
            }
          }
          setReady({ label: o.table_label ?? "Balcão", id: o.id });
          break;
        }
      }
    } else {
      readyOrders.forEach((o) => seenReady.current.add(o.id));
      if (orders) initialized.current = true;
    }
  }, [orders, trial]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setReady(null), 6000);
    return () => clearTimeout(t);
  }, [ready]);

  const sorted = useMemo(() => {
    return (tables ?? [])
      .filter((t) => t.operational || t.active_service_id)
      .sort((a, b) => a.label.localeCompare(b.label, "pt", { numeric: true }));
  }, [tables]);

  const selectedOrders = (orders ?? []).filter(
    (o) =>
      !o.archived &&
      o.status !== "cancelled" &&
      serviceTable &&
      findTableForRecord(tables ?? [], o)?.id === serviceTable.id,
  );
  if (!canContinueService(trial, "waiter")) {
    return (
      <div className="mx-auto w-full max-w-4xl py-10">
        <FeatureLocked feature="waiter" />
      </div>
    );
  }

  if (ordersQuery.isError || tablesQuery.isError)
    return (
      <QueryError
        message="Não foi possível atualizar as mesas. Atualize os pedidos antes de atender."
        retry={() => {
          void ordersQuery.refetch();
          void tablesQuery.refetch();
        }}
      />
    );
  if (ordersQuery.isPending || tablesQuery.isPending) return <DashboardSkeleton />;
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <SyncStatus
        connection={ordersQuery.realtime}
        updatedAt={ordersQuery.dataUpdatedAt}
        busy={ordersQuery.isFetching}
        error={ordersQuery.isError}
        retry={() => void ordersQuery.refetch()}
      />
      {serviceTable && (
        <TableServicePanel
          tableId={serviceTable.id}
          label={serviceTable.label}
          serviceId={tables?.find((t) => t.id === serviceTable.id)?.active_service_id}
          serviceStartedAt={tables?.find((t) => t.id === serviceTable.id)?.service_started_at}
          serviceState={tables?.find((t) => t.id === serviceTable.id)?.service_state}
          allowNew={tables?.some((t) => t.id === serviceTable.id && t.operational) === true}
          requireCode={restaurant?.require_table_code ?? true}
          count={selectedOrders.length}
          ready={selectedOrders.filter((o) => o.status === "ready").length}
          total={selectedOrders.reduce(
            (sum, o) =>
              sum + Number(o.subtotal) + Number(o.service_fee ?? 0) + Number(o.cover_charge ?? 0),
            0,
          )}
          currency={restaurant?.currency ?? "BRL"}
          oldest={selectedOrders.map((o) => o.created_at).sort()[0]}
          onClose={() => setServiceTable(null)}
          onOrder={() => {
            setOpenTable(serviceTable.id);
            setServiceTable(null);
          }}
          onBill={() => {
            setBillTable(tables?.find((t) => t.id === serviceTable.id) ?? null);
            setServiceTable(null);
          }}
        />
      )}
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-primary">Operação ao vivo</p>
        <h1 className="mt-2 font-sans font-semibold text-3xl tracking-tight">
          Painel do <span className="text-gradient-gold italic">garçom</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Toque numa mesa para lançar pedidos rapidamente.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {sorted.map((t) => {
          const stripped = normalizeTableLabel(t.label);
          const isBusy = !!t.active_service_id || occupied.has(t.id);
          const callList = callsByLabel.get(t.id) ?? [];
          const billCall = billCallsByLabel.get(t.id);
          const waiterCall = callList.find((c) => c.kind === "call");
          const hasAnyCall = callList.length > 0;

          return (
            <motion.button
              key={t.id}
              whileTap={{ scale: 0.96 }}
              onClick={() => setServiceTable({ id: t.id, label: t.label })}
              className={cn(
                "relative aspect-square rounded-2xl border p-4 text-left transition",
                hasAnyCall
                  ? "border-[oklch(0.78_0.18_84_/_0.7)] bg-[oklch(0.78_0.18_84_/_0.12)] shadow-[0_0_30px_-8px_oklch(0.78_0.18_84_/_0.6)]"
                  : isBusy
                    ? "border-[oklch(0.62_0.21_25_/_0.55)] bg-[oklch(0.62_0.21_25_/_0.08)]"
                    : "border-border bg-surface hover:border-[oklch(0.78_0.13_84_/_0.4)]",
              )}
            >
              {hasAnyCall && (
                <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-background">
                  {billCall ? (
                    <DollarSign className="h-3.5 w-3.5" />
                  ) : (
                    <Bell className="h-3.5 w-3.5" />
                  )}
                </span>
              )}
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Mesa</div>
              <div className="mt-1 font-sans font-semibold text-3xl tracking-tight">{stripped}</div>
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5",
                    hasAnyCall
                      ? "text-primary font-medium"
                      : isBusy
                        ? "text-[oklch(0.7_0.18_25)]"
                        : "text-emerald-400",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      hasAnyCall
                        ? "bg-primary"
                        : isBusy
                          ? "bg-[oklch(0.7_0.18_25)]"
                          : "bg-emerald-400",
                    )}
                  />
                  {billCall
                    ? "Pedindo a conta"
                    : waiterCall
                      ? "Chamando garçom"
                      : isBusy
                        ? "Ver conta"
                        : "Livre"}
                </span>
                {isBusy || hasAnyCall ? (
                  <Receipt className="h-3.5 w-3.5 text-[oklch(0.78_0.18_25)]" />
                ) : (
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
            </motion.button>
          );
        })}
        {sorted.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nenhuma mesa cadastrada. Crie em <span className="text-primary">QR Codes</span>.
          </div>
        )}
      </div>

      {billCallsByLabel.size > 0 && (
        <div className="rounded-2xl border border-[oklch(0.78_0.13_84_/_0.5)] bg-gold-soft p-4 animate-fade-up">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            <DollarSign className="h-4 w-4" />
            {billCallsByLabel.size}{" "}
            {billCallsByLabel.size === 1 ? "mesa pedindo a conta" : "mesas pedindo a conta"}
          </div>
          <ul className="space-y-1.5">
            {[...billCallsByLabel.entries()].map(([label, c]) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-background/60 px-3 py-2 text-sm"
              >
                <span className="font-medium">{tables?.find((t) => t.id === label)?.label}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setBillTable(tables?.find((t) => t.id === label) ?? null)}
                    className="rounded-lg border border-border bg-background px-3 min-h-11 py-2 text-sm transition hover:border-primary/40"
                  >
                    Abrir conta
                  </button>
                  <button
                    onClick={() => resolveCall.mutate(c.id)}
                    className="rounded-lg bg-primary px-3 min-h-11 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    Atendido
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AnimatePresence>
        {openTable && restaurant && (
          <QuickOrderModal
            tableId={openTable}
            tableLabel={sorted.find((t) => t.id === openTable)?.label ?? ""}
            restaurantId={restaurant.id}
            currency={restaurant.currency}
            onClose={() => setOpenTable(null)}
          />
        )}
        {billTable &&
          restaurant &&
          (() => {
            const tableOrders = (orders ?? []).filter(
              (order) =>
                ACTIVE.includes(order.status) &&
                findTableForRecord(tables ?? [], order)?.id === billTable.id &&
                (!order.service_id || order.service_id === billTable.active_service_id),
            );
            return (
              <BillModal
                table={billTable}
                restaurantId={restaurant.id}
                orders={tableOrders}
                currency={restaurant.currency}
                onClose={() => setBillTable(null)}
                onAddItems={() => {
                  const t = sorted.find((x) => x.id === billTable.id && x.operational);
                  if (t) {
                    setBillTable(null);
                    setOpenTable(t.id);
                  }
                }}
              />
            );
          })()}
      </AnimatePresence>

      <AnimatePresence>
        {ready && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed left-1/2 top-6 z-[60] -translate-x-1/2"
          >
            <div className="flex items-center gap-3 rounded-2xl border border-[oklch(0.78_0.13_84_/_0.5)] bg-gradient-to-r from-[oklch(0.78_0.13_84_/_0.25)] to-[oklch(0.7_0.18_150_/_0.18)] px-5 py-3 shadow-xl backdrop-blur">
              <Bell className="h-5 w-5 text-primary" />

              <div>
                <div className="text-xs uppercase tracking-wider text-primary">Pedido pronto</div>
                <div className="font-sans font-semibold text-lg tracking-tight">
                  {ready.label.startsWith("Mesa") ? ready.label : `Mesa ${ready.label}`} pronta!
                </div>
              </div>
              <button
                onClick={() => setReady(null)}
                className="ml-2 rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BillModal({
  table,
  restaurantId,
  orders,
  currency,
  onClose,
  onAddItems,
}: {
  table: VenueTable;
  restaurantId: string;
  orders: Order[];
  currency: string;
  onClose: () => void;
  onAddItems: () => void;
}) {
  const qc = useQueryClient();
  const tableLabel = table.label;
  const allItems = orders.flatMap((o) => o.order_items);
  const subtotal = allItems.reduce((s, it) => s + Number(it.price_snapshot) * it.quantity, 0);
  const [serviceFeeOn, setServiceFeeOn] = useState(false);
  const [serviceFeePct, setServiceFeePct] = useState("10");
  const [peopleInput, setPeopleInput] = useState("1");
  const [coverPerPersonInput, setCoverPerPersonInput] = useState("");
  const pct = Math.max(0, Math.min(100, Number(serviceFeePct.replace(",", ".")) || 0));
  const serviceFee = serviceFeeOn ? subtotal * (pct / 100) : 0;
  const people = Math.max(1, Math.floor(Number(peopleInput) || 1));
  const coverPerPerson = Math.max(0, Number(coverPerPersonInput.replace(",", ".")) || 0);
  const cover = coverPerPerson * people;
  const total = subtotal + serviceFee + cover;

  function optimisticallyArchive(ids: string[]) {
    qc.setQueriesData<Order[]>({ queryKey: ["orders"] }, (prev) =>
      prev ? prev.filter((o) => !ids.includes(o.id)) : prev,
    );
  }

  const close = useMutation({
    networkMode: "always",
    mutationFn: () => releaseTable(restaurantId, table, { serviceFee, coverCharge: cover }),
    onSuccess: (ids) => {
      optimisticallyArchive(ids);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.refetchQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["waiter_calls"] });
      qc.invalidateQueries({ queryKey: ["table-access-code"] });
      qc.invalidateQueries({ queryKey: ["venue_tables"] });
      qc.invalidateQueries({ queryKey: ["staff-tables"] });
      qc.invalidateQueries({ queryKey: ["table-events"] });
      toast.success(`${tableLabel} liberada`);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao fechar conta"),
  });

  // Força liberação: arquiva QUALQUER pedido residual desta mesa (por label normalizado)
  // e resolve chamados. Usado quando a mesa aparece "ocupada" mas não há itens visíveis.
  const forceFree = useMutation({
    networkMode: "always",
    mutationFn: () => releaseTable(restaurantId, table),
    onSuccess: (ids) => {
      optimisticallyArchive(ids);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.refetchQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["waiter_calls"] });
      qc.invalidateQueries({ queryKey: ["table-access-code"] });
      toast.success(`${tableLabel} marcada como livre`);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao liberar mesa"),
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Conta da mesa"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border bg-background sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Conta da mesa
            </div>
            <h2 className="font-sans font-semibold text-xl tracking-tight">{tableLabel}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {orders.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <p>Sem itens ativos nesta mesa.</p>
              <p className="mt-1 text-xs">
                Se a mesa aparece ocupada, use "Marcar mesa como livre" abaixo.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                <span>Histórico da mesa</span>
                <span>
                  {orders.length} {orders.length === 1 ? "pedido" : "pedidos"}
                </span>
              </div>
              {[...orders]
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .map((o, idx) => {
                  const when = new Date(o.created_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const orderSubtotal = o.order_items.reduce(
                    (s, it) => s + Number(it.price_snapshot) * it.quantity,
                    0,
                  );
                  const statusMap: Record<string, { label: string; cls: string }> = {
                    pending: {
                      label: "Aguardando",
                      cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",
                    },
                    accepted: {
                      label: "Aceito",
                      cls: "bg-sky-500/15 text-sky-300 border-sky-500/30",
                    },
                    preparing: {
                      label: "Preparando",
                      cls: "bg-orange-500/15 text-orange-300 border-orange-500/30",
                    },
                    ready: {
                      label: "Pronto",
                      cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
                    },
                    served: {
                      label: "Entregue",
                      cls: "bg-muted text-muted-foreground border-border",
                    },
                  };
                  const st = statusMap[o.status] ?? statusMap.served;
                  return (
                    <div
                      key={o.id}
                      className="rounded-xl border border-border bg-background/40 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                          <span className="font-semibold text-foreground">Pedido #{idx + 1}</span>
                          <span className="text-muted-foreground">{when}</span>
                          {o.created_by_name && (
                            <span className="text-muted-foreground">· por {o.created_by_name}</span>
                          )}
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wider",
                            st.cls,
                          )}
                        >
                          {st.label}
                        </span>
                      </div>
                      {o.customer_name && (
                        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-gold-soft px-2 py-0.5 text-xs font-medium text-primary">
                          Cliente: {o.customer_name}
                        </div>
                      )}
                      <ul className="divide-y divide-border/60">
                        {o.order_items.map((it) => (
                          <li key={it.id} className="flex flex-col gap-0.5 py-1.5">
                            <div className="flex items-center justify-between gap-2 text-sm">
                              <span>
                                <span className="font-medium text-primary">{it.quantity}×</span>{" "}
                                {it.name_snapshot}
                              </span>
                              <span className="text-muted-foreground">
                                {formatPrice(Number(it.price_snapshot) * it.quantity, currency)}
                              </span>
                            </div>
                            {it.notes && (
                              <span className="pl-5 text-xs italic text-muted-foreground">
                                obs: {it.notes}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-1.5 text-xs">
                        <span className="text-muted-foreground">Subtotal do pedido</span>
                        <span className="font-medium">{formatPrice(orderSubtotal, currency)}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        <div className="border-t border-border bg-surface/50 px-5 py-4">
          <div className="mb-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatPrice(subtotal, currency)}</span>
            </div>

            <div className="rounded-xl border border-border bg-background px-3 py-2">
              <label className="flex items-center justify-between gap-3 text-sm cursor-pointer">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={serviceFeeOn}
                    onChange={(e) => setServiceFeeOn(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span>Taxa de Serviço</span>
                </span>
                <span className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.5"
                    value={serviceFeePct}
                    onChange={(e) => setServiceFeePct(e.target.value)}
                    disabled={!serviceFeeOn}
                    className="w-14 rounded-md border border-border bg-background px-2 py-1 text-right text-sm outline-none disabled:opacity-50"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  <span className="ml-2 min-w-[64px] text-right text-muted-foreground">
                    {serviceFeeOn ? `+ ${formatPrice(serviceFee, currency)}` : "—"}
                  </span>
                </span>
              </label>
            </div>

            <div className="rounded-xl border border-border bg-background px-3 py-2 space-y-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Couvert Artístico (por pessoa)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Pessoas</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step="1"
                    value={peopleInput}
                    onChange={(e) => setPeopleInput(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{currency}/pessoa</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={coverPerPersonInput}
                    onChange={(e) => setCoverPerPersonInput(e.target.value)}
                    placeholder="0,00"
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none"
                  />
                </label>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {people} × {formatPrice(coverPerPerson, currency)}
                </span>
                <span>{cover > 0 ? `+ ${formatPrice(cover, currency)}` : "—"}</span>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Total Geral
              </span>
              <span className="font-sans font-semibold text-3xl tracking-tight text-primary">
                {formatPrice(total, currency)}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <SplitBillDialog total={total} currency={currency} />
            <div className="flex gap-2">
              <button
                onClick={onAddItems}
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-border bg-background text-sm font-semibold transition hover:border-[oklch(0.78_0.13_84_/_0.4)]"
              >
                + Itens
              </button>
              <button
                onClick={() => close.mutate()}
                disabled={close.isPending || orders.length === 0}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:opacity-50"
              >
                {close.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Finalizar e liberar"
                )}
              </button>
            </div>
            <button
              onClick={() => {
                if (
                  confirm(
                    `Encerrar o atendimento de ${tableLabel} e invalidar o código? Isso não registra pagamento.`,
                  )
                ) {
                  forceFree.mutate();
                }
              }}
              disabled={forceFree.isPending || orders.length > 0}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-transparent text-sm font-medium text-muted-foreground transition hover:border-emerald-400/50 hover:text-emerald-400 disabled:opacity-50"
            >
              {forceFree.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Liberar mesa"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
