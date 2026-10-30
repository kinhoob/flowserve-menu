import type { StaffOrder } from "@/features/staff/staff-rpc";
import {
  staffArchiveOrders,
  staffListCalls,
  staffListOrders,
  staffListTables,
  staffResolveCall,
} from "@/features/staff/staff-rpc";
import { useStaffSession } from "@/features/staff/staff-session";
import { QuickOrderModal } from "@/features/waiter/quick-order-dialog";
import { supabase } from "@/integrations/supabase/client";
import { normalizeTableLabel } from "@/lib/operations";
import { recordRealtimeEvent } from "@/lib/realtime-telemetry";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Bell, DollarSign, Loader2, Plus, Receipt, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/staff/$slug/waiter")({
  component: StaffWaiter,
});

const ACTIVE = ["pending", "accepted", "preparing", "ready", "served"];

const fmt = (n: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(n) || 0);

function StaffWaiter() {
  const { slug } = Route.useParams();
  const session = useStaffSession(slug);
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!session) navigate({ to: "/staff/$slug", params: { slug } });
  }, [session, navigate, slug]);

  const tablesQ = useQuery({
    queryKey: ["staff-tables", session?.token],
    enabled: !!session?.token,
    refetchInterval: 5000,
    queryFn: () => staffListTables(session!.token),
  });

  const ordersQ = useQuery({
    queryKey: ["staff-orders", session?.token],
    enabled: !!session?.token,
    refetchInterval: 5000,
    queryFn: () => staffListOrders(session!.token),
  });

  const callsQ = useQuery({
    queryKey: ["staff-calls", session?.token],
    enabled: !!session?.token,
    refetchInterval: 5000,
    queryFn: () => staffListCalls(session!.token),
  });

  const restaurantId: string | undefined =
    tablesQ.data?.[0]?.restaurant_id ?? ordersQ.data?.[0]?.restaurant_id;

  // Fetch restaurant currency via slug (public)
  const restaurantQ = useQuery({
    queryKey: ["staff-restaurant", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, currency")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const currency = restaurantQ.data?.currency ?? "BRL";
  const restId = restaurantId ?? restaurantQ.data?.id;

  useEffect(() => {
    if (!session) return;
    const ch = supabase
      .channel(`staff-live-${session.token}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        recordRealtimeEvent("waiter", payload);
        qc.invalidateQueries({ queryKey: ["staff-orders", session.token] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, (payload) => {
        recordRealtimeEvent("waiter", payload);
        qc.invalidateQueries({ queryKey: ["staff-orders", session.token] });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waiter_calls" },
        (payload) => {
          recordRealtimeEvent("calls", payload);
          qc.invalidateQueries({ queryKey: ["staff-calls", session.token] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [session, qc]);

  const archive = useMutation({
    mutationFn: async (ids: string[]) => staffArchiveOrders(session!.token, ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-orders", session?.token] });
      toast.success("Mesa liberada");
    },
  });

  const resolveCall = useMutation({
    mutationFn: async (id: string) => staffResolveCall(session!.token, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-calls", session?.token] }),
  });

  const tables = useMemo(() => tablesQ.data ?? [], [tablesQ.data]);
  const orders = useMemo(() => ordersQ.data ?? [], [ordersQ.data]);
  const calls = useMemo(() => callsQ.data ?? [], [callsQ.data]);

  const sorted = useMemo(
    () =>
      [...tables].sort((a, b) =>
        String(a.label).localeCompare(String(b.label), "pt", { numeric: true }),
      ),
    [tables],
  );

  const activeByLabel = useMemo(() => {
    const m = new Map<string, StaffOrder[]>();
    for (const o of orders) {
      if (!ACTIVE.includes(o.status)) continue;
      if (o.archived) continue;
      const key = normalizeTableLabel(o.table_label);
      if (!key) continue;
      const arr = m.get(key) ?? [];
      arr.push(o);
      m.set(key, arr);
    }
    return m;
  }, [orders]);

  const callsByLabel = useMemo(() => {
    const m = new Map<string, { id: string; kind: "bill" | "call" }[]>();
    for (const c of calls) {
      const key = normalizeTableLabel(c.table_label);
      if (!key) continue;
      const arr = m.get(key) ?? [];
      arr.push({ id: c.id, kind: c.kind === "bill" ? "bill" : "call" });
      m.set(key, arr);
    }
    return m;
  }, [calls]);

  const [openTable, setOpenTable] = useState<{ id: string; label: string } | null>(null);
  const [billTable, setBillTable] = useState<string | null>(null);

  if (!session) return null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <Link
        to="/staff/$slug"
        params={{ slug }}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </Link>

      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-primary">Operação ao vivo</p>
        <h1 className="mt-1 font-display text-2xl tracking-tight">Painel do garçom</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Toque em uma mesa para lançar pedidos ou ver a conta.
        </p>
      </div>

      {calls.length > 0 && (
        <section className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
            <Bell className="h-4 w-4" /> {calls.length} chamado(s) em aberto
          </div>
          <ul className="mt-3 space-y-2">
            {calls.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-lg bg-background/40 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">
                    {c.kind === "bill" ? "Conta" : "Chamado"} · {c.table_label || "Sem mesa"}
                  </div>
                  {c.customer_name && (
                    <div className="text-xs text-muted-foreground">Por {c.customer_name}</div>
                  )}
                </div>
                <button
                  onClick={() => resolveCall.mutate(c.id)}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface"
                >
                  Atender
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {sorted.map((t) => {
          const stripped = normalizeTableLabel(t.label);
          const tableOrders = activeByLabel.get(stripped) ?? [];
          const isBusy = tableOrders.length > 0;
          const callList = callsByLabel.get(stripped) ?? [];
          const billCall = callList.find((c) => c.kind === "bill");
          const hasAnyCall = callList.length > 0;
          const total = tableOrders.reduce((s, o) => s + Number(o.total ?? o.subtotal ?? 0), 0);
          return (
            <motion.button
              key={t.id}
              whileTap={{ scale: 0.96 }}
              onClick={() =>
                isBusy || hasAnyCall
                  ? setBillTable(t.label)
                  : setOpenTable({ id: t.id, label: t.label })
              }
              className={cn(
                "relative aspect-square rounded-2xl border p-4 text-left transition",
                hasAnyCall
                  ? "border-[oklch(0.78_0.18_84_/_0.7)] bg-[oklch(0.78_0.18_84_/_0.12)] animate-pulse"
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
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Mesa</div>
              <div className="mt-1 font-display text-3xl tracking-tight">{stripped}</div>
              {isBusy && (
                <div className="mt-1 text-[11px] text-primary">{fmt(total, currency)}</div>
              )}
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px]">
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
                        ? "bg-primary animate-pulse"
                        : isBusy
                          ? "bg-[oklch(0.7_0.18_25)]"
                          : "bg-emerald-400",
                    )}
                  />
                  {billCall
                    ? "Pedindo conta"
                    : hasAnyCall
                      ? "Chamando"
                      : isBusy
                        ? "Ver conta"
                        : "Livre"}
                </span>
                {isBusy || hasAnyCall ? (
                  <Receipt className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
            </motion.button>
          );
        })}
        {sorted.length === 0 && !tablesQ.isLoading && (
          <div className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nenhuma mesa cadastrada.
          </div>
        )}
        {tablesQ.isLoading && (
          <div className="col-span-full flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <AnimatePresence>
        {openTable && restId && (
          <QuickOrderModal
            tableId={openTable.id}
            tableLabel={openTable.label}
            restaurantId={restId}
            currency={currency}
            staffIdentity={{ name: session.name, token: session.token }}
            onClose={() => setOpenTable(null)}
            onDone={() => qc.invalidateQueries({ queryKey: ["staff-orders", session.token] })}
          />
        )}
        {billTable &&
          (() => {
            const key = normalizeTableLabel(billTable);
            const tableOrders = activeByLabel.get(key) ?? [];
            const t = sorted.find((x) => x.label === billTable);
            return (
              <BillModal
                tableLabel={billTable}
                orders={tableOrders}
                currency={currency}
                onClose={() => setBillTable(null)}
                onFinalize={() => {
                  if (tableOrders.length === 0) {
                    setBillTable(null);
                    return;
                  }
                  if (confirm(`Finalizar e liberar ${billTable}?`)) {
                    archive.mutate(tableOrders.map((o) => o.id));
                    setBillTable(null);
                  }
                }}
                onAddItems={() => {
                  if (t) {
                    setBillTable(null);
                    setOpenTable({ id: t.id, label: t.label });
                  }
                }}
              />
            );
          })()}
      </AnimatePresence>
    </main>
  );
}

function BillModal({
  tableLabel,
  orders,
  currency,
  onClose,
  onAddItems,
  onFinalize,
}: {
  tableLabel: string;
  orders: StaffOrder[];
  currency: string;
  onClose: () => void;
  onAddItems: () => void;
  onFinalize: () => void;
}) {
  const sorted = [...orders].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const subtotal = sorted.reduce(
    (s, o) =>
      s +
      (o.items ?? []).reduce(
        (ss: number, it) => ss + Number(it.price ?? 0) * Number(it.quantity ?? 0),
        0,
      ),
    0,
  );
  const extras = sorted.reduce(
    (s, o) => s + Number(o.service_fee ?? 0) + Number(o.cover_charge ?? 0),
    0,
  );
  const total = subtotal + extras;

  const statusMap: Record<string, { label: string; cls: string }> = {
    pending: { label: "Aguardando", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
    accepted: { label: "Aceito", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
    preparing: {
      label: "Preparando",
      cls: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    },
    ready: { label: "Pronto", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
    served: { label: "Entregue", cls: "bg-muted text-muted-foreground border-border" },
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
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
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Conta da mesa
            </div>
            <h2 className="font-display text-xl tracking-tight">{tableLabel}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {sorted.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Sem itens ativos nesta mesa.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>Histórico da mesa</span>
                <span>
                  {sorted.length} {sorted.length === 1 ? "pedido" : "pedidos"}
                </span>
              </div>
              {sorted.map((o, idx) => {
                const when = new Date(o.created_at).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const orderSubtotal = (o.items ?? []).reduce(
                  (s: number, it) => s + Number(it.price ?? 0) * Number(it.quantity ?? 0),
                  0,
                );
                const st = statusMap[o.status] ?? statusMap.served;
                return (
                  <div key={o.id} className="rounded-xl border border-border bg-background/40 p-3">
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
                          "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                          st.cls,
                        )}
                      >
                        {st.label}
                      </span>
                    </div>
                    {o.customer_name && (
                      <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        Cliente: {o.customer_name}
                      </div>
                    )}
                    <ul className="divide-y divide-border/60">
                      {(o.items ?? []).map((it) => (
                        <li key={it.id} className="flex flex-col gap-0.5 py-1.5">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span>
                              <span className="font-medium text-primary">{it.quantity}×</span>{" "}
                              {it.name}
                            </span>
                            <span className="text-muted-foreground">
                              {fmt(Number(it.price ?? 0) * Number(it.quantity ?? 0), currency)}
                            </span>
                          </div>
                          {it.notes && (
                            <span className="pl-5 text-[11px] italic text-muted-foreground">
                              obs: {it.notes}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-1.5 text-[11px]">
                      <span className="text-muted-foreground">Subtotal do pedido</span>
                      <span className="font-medium">{fmt(orderSubtotal, currency)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-border bg-surface/50 px-5 py-4">
          <div className="mb-3 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{fmt(subtotal, currency)}</span>
            </div>
            {extras > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Taxas / Couvert</span>
                <span>{fmt(extras, currency)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Total</span>
              <span className="font-display text-2xl tracking-tight text-primary">
                {fmt(total, currency)}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onAddItems}
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-border bg-background text-sm font-semibold transition hover:border-[oklch(0.78_0.13_84_/_0.4)]"
            >
              + Itens
            </button>
            <button
              onClick={onFinalize}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95"
            >
              <Receipt className="h-4 w-4" /> Finalizar e liberar
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
