import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, DollarSign, Loader2, Minus, Plus, Receipt, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { useTables } from "@/features/tables/table-queries";
import { useOrders, type Order } from "@/features/orders/order-queries";
import { useWaiterCalls, useResolveWaiterCall } from "@/features/waiter/waiter-queries";
import { formatPrice } from "@/routes/_authenticated/menu";
import { playChime } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { useTrialStatus, canAccess, FeatureLocked } from "@/features/billing/trial-guard";
import { StaffPicker } from "@/features/staff/staff-picker";

// A table is "ocupada" enquanto houver qualquer pedido não-arquivado e não cancelado.
// O status "served" ainda conta como ocupado — só sai com Finalizar e liberar (archived=true).
const ACTIVE: Order["status"][] = ["pending", "accepted", "preparing", "ready", "served"];

export const Route = createFileRoute("/_authenticated/waiter")({
  head: () => ({ meta: [{ title: "Garçom — Flux" }] }),
  component: WaiterPage,
});

type WItem = {
  id: string;
  name: string;
  price: number;
  category_id: string;
  category_name: string;
};

type Line = { itemId: string; name: string; price: number; qty: number; notes: string };

function WaiterPage() {
  const { data: restaurant } = useRestaurant();
  const { data: tables } = useTables(restaurant?.id);
  const { data: orders } = useOrders(restaurant?.id);
  const { data: trial } = useTrialStatus();
  const { data: waiterCalls = [] } = useWaiterCalls(restaurant?.id);
  const resolveCall = useResolveWaiterCall(restaurant?.id);
  const [openTable, setOpenTable] = useState<string | null>(null);
  const [billTable, setBillTable] = useState<string | null>(null);
  const [ready, setReady] = useState<{ label: string; id: string } | null>(null);
  const [recentlyFreed, setRecentlyFreed] = useState<Set<string>>(new Set());
  const seenReady = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  const markFreed = (label: string) => {
    const stripped = label.replace(/^Mesa\s*/i, "").trim();
    const variants = [label, stripped, `Mesa ${stripped}`];
    setRecentlyFreed((prev) => {
      const next = new Set(prev);
      variants.forEach((v) => next.add(v));
      return next;
    });
    setTimeout(() => {
      setRecentlyFreed((prev) => {
        const next = new Set(prev);
        variants.forEach((v) => next.delete(v));
        return next;
      });
    }, 10000);
  };

  // Calls "pedir conta" e "chamar garçom" por table_label (qualquer chamado não resolvido)
  const callsByLabel = useMemo(() => {
    const m = new Map<string, { id: string; created_at: string; kind: "bill" | "call" }[]>();
    for (const c of waiterCalls) {
      if (c.resolved) continue;
      const kind = ((c as any).kind === "bill" ? "bill" : "call") as "bill" | "call";
      const lbl = (c.table_label ?? "").replace(/^Mesa\s*/i, "").trim();
      if (!lbl) continue;
      const arr = m.get(lbl) ?? [];
      arr.push({ id: c.id, created_at: c.created_at, kind });
      m.set(lbl, arr);
    }
    return m;
  }, [waiterCalls]);

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
        if (recentlyFreed.has(o.table_label)) continue;
        s.add(o.table_label);
        s.add(o.table_label.replace(/^Mesa\s*/i, "").trim());
      }
    }
    return s;
  }, [orders, recentlyFreed]);

  // Detect newly-ready orders
  useEffect(() => {
    const readyOrders = (orders ?? []).filter((o) => o.status === "ready");
    if (initialized.current) {
      for (const o of readyOrders) {
        if (!seenReady.current.has(o.id)) {
          seenReady.current.add(o.id);
          playChime();
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            try { navigator.vibrate([200, 100, 200]); } catch {}
          }
          setReady({ label: o.table_label ?? "Balcão", id: o.id });
          break;
        }
      }
    } else {
      readyOrders.forEach((o) => seenReady.current.add(o.id));
      if (orders) initialized.current = true;
    }
  }, [orders]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setReady(null), 6000);
    return () => clearTimeout(t);
  }, [ready]);

  const sorted = useMemo(() => {
    return [...(tables ?? [])].sort((a, b) => a.label.localeCompare(b.label, "pt", { numeric: true }));
  }, [tables]);

  if (trial && !canAccess(trial, "waiter")) {
    return (
      <div className="mx-auto w-full max-w-4xl py-10">
        <FeatureLocked feature="waiter" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-primary">Operação ao vivo</p>
        <h1 className="mt-2 font-display text-3xl tracking-tight">
          Painel do <span className="text-gradient-gold italic">garçom</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Toque numa mesa para lançar pedidos rapidamente.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {sorted.map((t) => {
          const stripped = t.label.replace(/^Mesa\s*/i, "").trim();
          const isBusy = occupied.has(t.label) || occupied.has(stripped);
          const callList = callsByLabel.get(stripped) ?? [];
          const billCall = billCallsByLabel.get(stripped);
          const waiterCall = callList.find((c) => c.kind === "call");
          const hasAnyCall = callList.length > 0;
          return (
            <motion.button
              key={t.id}
              whileTap={{ scale: 0.96 }}
              onClick={() => (isBusy || hasAnyCall ? setBillTable(t.label) : setOpenTable(t.id))}
              className={cn(
                "relative aspect-square rounded-2xl border p-4 text-left transition",
                hasAnyCall
                  ? "border-[oklch(0.78_0.18_84_/_0.7)] bg-[oklch(0.78_0.18_84_/_0.12)] animate-pulse shadow-[0_0_30px_-8px_oklch(0.78_0.18_84_/_0.6)]"
                  : isBusy
                    ? "border-[oklch(0.62_0.21_25_/_0.55)] bg-[oklch(0.62_0.21_25_/_0.08)]"
                    : "border-border bg-surface hover:border-[oklch(0.78_0.13_84_/_0.4)]",
              )}
            >
              {hasAnyCall && (
                <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-background animate-pulse">
                  {billCall ? <DollarSign className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                </span>
              )}
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Mesa</div>
              <div className="mt-1 font-display text-3xl tracking-tight">{stripped}</div>
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
                          ? "bg-[oklch(0.7_0.18_25)] animate-pulse"
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
            <DollarSign className="h-4 w-4 animate-pulse" />
            {billCallsByLabel.size} {billCallsByLabel.size === 1 ? "mesa pedindo a conta" : "mesas pedindo a conta"}
          </div>
          <ul className="space-y-1.5">
            {[...billCallsByLabel.entries()].map(([label, c]) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-background/60 px-3 py-2 text-sm">
                <span className="font-medium">Mesa {label}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setBillTable(`Mesa ${label}`)}
                    className="rounded-lg border border-border bg-background px-3 py-1 text-xs transition hover:border-primary/40"
                  >
                    Abrir conta
                  </button>
                  <button
                    onClick={() => resolveCall.mutate(c.id)}
                    className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
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
        {billTable && restaurant && (() => {
          const stripped = billTable.replace(/^Mesa\s*/i, "").trim();
          const variants = new Set([billTable, stripped, `Mesa ${stripped}`]);
          // Inclui TODOS os pedidos ativos da mesa (pending → served / entregue),
          // independente da grafia do label, para que a soma da conta nunca perca
          // pedidos já entregues mas ainda não finalizados.
          const tableOrders = (orders ?? []).filter(
            (o) =>
              ACTIVE.includes(o.status) &&
              o.table_label &&
              variants.has(o.table_label),
          );
          return (
            <BillModal
              tableLabel={billTable}
              restaurantId={restaurant.id}
              orders={tableOrders}
              currency={restaurant.currency}
              onClose={() => setBillTable(null)}
              onFreed={markFreed}
              onAddItems={() => {
                const t = sorted.find((x) => x.label === billTable);
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
              <Bell className="h-5 w-5 text-primary animate-pulse" />
              <div>
                <div className="text-[11px] uppercase tracking-wider text-primary">Pedido pronto</div>
                <div className="font-display text-lg tracking-tight">
                  {ready.label.startsWith("Mesa") ? ready.label : `Mesa ${ready.label}`} pronta!
                </div>
              </div>
              <button onClick={() => setReady(null)} className="ml-2 rounded-md p-1 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function QuickOrderModal({
  tableId,
  tableLabel,
  restaurantId,
  currency,
  onClose,
}: {
  tableId: string;
  tableLabel: string;
  restaurantId: string;
  currency: string;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [pickingStaff, setPickingStaff] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: ["waiter-items", restaurantId],
    queryFn: async (): Promise<WItem[]> => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, price, category_id, is_available, categories(name)")
        .eq("restaurant_id", restaurantId)
        .eq("is_available", true)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        price: Number(r.price),
        category_id: r.category_id,
        category_name: r.categories?.name ?? "",
      }));
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items ?? [];
    return (items ?? []).filter(
      (i) => i.name.toLowerCase().includes(term) || i.category_name.toLowerCase().includes(term),
    );
  }, [items, q]);

  function addItem(it: WItem) {
    setLines((prev) => {
      const ex = prev.find((l) => l.itemId === it.id);
      if (ex) return prev.map((l) => (l.itemId === it.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { itemId: it.id, name: it.name, price: it.price, qty: 1, notes: "" }];
    });
  }

  function setQty(id: string, qty: number) {
    if (qty <= 0) {
      setLines((p) => p.filter((l) => l.itemId !== id));
      return;
    }
    setLines((p) => p.map((l) => (l.itemId === id ? { ...l, qty } : l)));
  }

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);

  function requestSubmit() {
    if (lines.length === 0) return;
    setPickingStaff(true);
  }

  async function submit(createdByName: string) {
    if (lines.length === 0) return;
    setSubmitting(true);
    try {
      const { data: order, error: oErr } = await supabase
        .from("orders")
        .insert({
          restaurant_id: restaurantId,
          table_id: tableId,
          table_label: tableLabel,
          subtotal,
          currency,
          status: "pending",
          created_by_name: createdByName,
        } as any)
        .select()
        .single();
      if (oErr) throw oErr;
      const rows = lines.map((l) => ({
        order_id: order.id,
        menu_item_id: l.itemId,
        name_snapshot: l.name,
        price_snapshot: l.price,
        quantity: l.qty,
        notes: l.notes || null,
      }));
      const { error: iErr } = await supabase.from("order_items").insert(rows);
      if (iErr) throw iErr;
      toast.success(`Pedido enviado · ${tableLabel}`, {
        description: `${lines.reduce((s, l) => s + l.qty, 0)} item(s) · ${formatPrice(subtotal, currency)}`,
      });
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao enviar pedido");
    } finally {
      setSubmitting(false);
    }
  }

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
        className="flex h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border bg-background sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Lançamento rápido</div>
            <h2 className="font-display text-xl tracking-tight">{tableLabel}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar item ou categoria…"
              className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[oklch(0.78_0.13_84_/_0.5)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ul className="space-y-1.5 pb-2">
              {filtered.map((it) => {
                const ex = lines.find((l) => l.itemId === it.id);
                return (
                  <li
                    key={it.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
                  >
                    <button onClick={() => addItem(it)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-medium">{it.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {it.category_name} · {formatPrice(it.price, currency)}
                      </div>
                    </button>
                    {ex ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setQty(it.id, ex.qty - 1)}
                          className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-[1.5rem] text-center text-sm font-medium">{ex.qty}</span>
                        <button
                          onClick={() => setQty(it.id, ex.qty + 1)}
                          className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addItem(it)}
                        className="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                      >
                        Adicionar
                      </button>
                    )}
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="py-8 text-center text-sm text-muted-foreground">Nenhum item encontrado.</li>
              )}
            </ul>
          )}
        </div>

        <div className="border-t border-border bg-surface/50 px-5 py-3">
          {lines.length > 0 && (
            <div className="mb-3 max-h-32 space-y-1.5 overflow-y-auto">
              {lines.map((l) => (
                <div key={l.itemId} className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-primary">{l.qty}×</span>
                  <span className="flex-1 truncate">{l.name}</span>
                  <input
                    value={l.notes}
                    onChange={(e) =>
                      setLines((p) => p.map((x) => (x.itemId === l.itemId ? { ...x, notes: e.target.value } : x)))
                    }
                    placeholder="obs"
                    className="w-24 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] outline-none focus:border-[oklch(0.78_0.13_84_/_0.5)]"
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Subtotal</div>
              <div className="font-display text-xl tracking-tight">{formatPrice(subtotal, currency)}</div>
            </div>
            <button
              onClick={requestSubmit}
              disabled={lines.length === 0 || submitting}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4" /> Enviar pedido
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
      <AnimatePresence>
        {pickingStaff && (
          <StaffPicker
            restaurantId={restaurantId}
            title="Quem lançou esse pedido?"
            onSelect={async (name) => {
              setPickingStaff(false);
              await submit(name);
            }}
            onClose={() => setPickingStaff(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function BillModal({
  tableLabel,
  restaurantId,
  orders,
  currency,
  onClose,
  onAddItems,
}: {
  tableLabel: string;
  restaurantId: string;
  orders: Order[];
  currency: string;
  onClose: () => void;
  onAddItems: () => void;
}) {
  const qc = useQueryClient();
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

  async function resolveCallsForTable() {
    const stripped = tableLabel.replace(/^Mesa\s*/i, "").trim();
    const variants = Array.from(new Set([tableLabel, stripped, `Mesa ${stripped}`]));
    await supabase
      .from("waiter_calls")
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq("restaurant_id", restaurantId)
      .in("table_label", variants)
      .eq("resolved", false);
  }

  function optimisticallyArchive(ids: string[]) {
    qc.setQueriesData<Order[]>({ queryKey: ["orders"] }, (prev) =>
      prev ? prev.filter((o) => !ids.includes(o.id)) : prev,
    );
  }
  function optimisticallyArchiveByLabel(labels: string[]) {
    qc.setQueriesData<Order[]>({ queryKey: ["orders"] }, (prev) =>
      prev
        ? prev.filter(
            (o) => !(o.table_label && labels.includes(o.table_label) && ACTIVE.includes(o.status)),
          )
        : prev,
    );
  }

  const close = useMutation({
    mutationFn: async () => {
      const ids = orders.map((o) => o.id);
      const primaryId = ids[0];
      if ((serviceFee > 0 || cover > 0) && primaryId) {
        const { error: feeErr } = await supabase
          .from("orders")
          .update({ service_fee: serviceFee, cover_charge: cover } as any)
          .eq("id", primaryId);
        if (feeErr) throw feeErr;
      }
      if (ids.length > 0) {
        const { error } = await supabase
          .from("orders")
          .update({ status: "served", archived: true } as any)
          .in("id", ids);
        if (error) throw error;
      }
      await resolveCallsForTable();
      return ids;
    },
    onSuccess: (ids) => {
      optimisticallyArchive(ids);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.refetchQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["waiter_calls"] });
      toast.success(`${tableLabel} liberada`);
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao fechar conta"),
  });

  // Força liberação: arquiva QUALQUER pedido residual desta mesa (por label) e resolve chamados.
  // Usado quando a mesa aparece "ocupada" mas não há itens visíveis (estado fantasma).
  const forceFree = useMutation({
    mutationFn: async () => {
      const stripped = tableLabel.replace(/^Mesa\s*/i, "").trim();
      const variants = Array.from(new Set([tableLabel, stripped, `Mesa ${stripped}`]));
      const { error } = await supabase
        .from("orders")
        .update({ archived: true, status: "served" } as any)
        .eq("restaurant_id", restaurantId)
        .in("table_label", variants)
        .in("status", ACTIVE);
      if (error) throw error;
      await resolveCallsForTable();
      return variants;
    },
    onSuccess: (variants) => {
      optimisticallyArchiveByLabel(variants);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.refetchQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["waiter_calls"] });
      toast.success(`${tableLabel} marcada como livre`);
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao liberar mesa"),
  });


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
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Conta da mesa</div>
            <h2 className="font-display text-xl tracking-tight">{tableLabel}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {orders.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <p>Sem itens ativos nesta mesa.</p>
              <p className="mt-1 text-xs">Se a mesa aparece ocupada, use "Marcar mesa como livre" abaixo.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>Histórico da mesa</span>
                <span>{orders.length} {orders.length === 1 ? "pedido" : "pedidos"}</span>
              </div>
              {[...orders]
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .map((o, idx) => {
                  const when = new Date(o.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  const orderSubtotal = o.order_items.reduce(
                    (s, it) => s + Number(it.price_snapshot) * it.quantity,
                    0,
                  );
                  const statusMap: Record<string, { label: string; cls: string }> = {
                    pending: { label: "Aguardando", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
                    accepted: { label: "Aceito", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
                    preparing: { label: "Preparando", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
                    ready: { label: "Pronto", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
                    served: { label: "Entregue", cls: "bg-muted text-muted-foreground border-border" },
                  };
                  const st = statusMap[o.status] ?? statusMap.served;
                  return (
                    <div key={o.id} className="rounded-xl border border-border bg-background/40 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                          <span className="font-semibold text-foreground">Pedido #{idx + 1}</span>
                          <span className="text-muted-foreground">{when}</span>
                          {o.created_by_name && (
                            <span className="text-muted-foreground">· {o.created_by_name}</span>
                          )}
                        </div>
                        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider", st.cls)}>
                          {st.label}
                        </span>
                      </div>
                      <ul className="divide-y divide-border/60">
                        {o.order_items.map((it) => (
                          <li key={it.id} className="flex flex-col gap-0.5 py-1.5">
                            <div className="flex items-center justify-between gap-2 text-sm">
                              <span>
                                <span className="font-medium text-primary">{it.quantity}×</span> {it.name_snapshot}
                              </span>
                              <span className="text-muted-foreground">
                                {formatPrice(Number(it.price_snapshot) * it.quantity, currency)}
                              </span>
                            </div>
                            {it.notes && (
                              <span className="pl-5 text-[11px] italic text-muted-foreground">obs: {it.notes}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-1.5 text-[11px]">
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
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Couvert Artístico (por pessoa)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Pessoas</span>
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
                  <span className="text-[11px] text-muted-foreground">{currency}/pessoa</span>
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
                <span>{people} × {formatPrice(coverPerPerson, currency)}</span>
                <span>{cover > 0 ? `+ ${formatPrice(cover, currency)}` : "—"}</span>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Total Geral</span>
              <span className="font-display text-3xl tracking-tight text-primary">{formatPrice(total, currency)}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
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
                {close.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Finalizar e liberar"}
              </button>
            </div>
            <button
              onClick={() => {
                if (confirm(`Marcar ${tableLabel} como livre? Qualquer pedido residual será arquivado sem cobrança.`)) {
                  forceFree.mutate();
                }
              }}
              disabled={forceFree.isPending}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-transparent text-sm font-medium text-muted-foreground transition hover:border-emerald-400/50 hover:text-emerald-400 disabled:opacity-50"
            >
              {forceFree.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Marcar mesa como livre (sem cobrança)"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
