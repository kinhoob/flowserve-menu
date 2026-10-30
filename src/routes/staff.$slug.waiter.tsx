import { ModifierPicker, type SelectedModifier } from "@/features/menu/modifier-picker";
import { fetchModifiersForRestaurant } from "@/features/menu/modifier-queries";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Bell,
  Loader2,
  Minus,
  Plus,
  Receipt,
  Search,
  Send,
  X,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { useStaffSession } from "@/features/staff/staff-session";
import {
  staffListOrders,
  staffListTables,
  staffListCalls,
  staffResolveCall,
  staffArchiveOrders,
} from "@/features/staff/staff-rpc";
import { supabase } from "@/integrations/supabase/client";
import { recordRealtimeEvent } from "@/lib/realtime-telemetry";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/staff/$slug/waiter")({
  component: StaffWaiter,
});

const ACTIVE = ["pending", "accepted", "preparing", "ready", "served"];

const fmt = (n: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(n) || 0);

const normalizeLabel = (s: string | null | undefined) =>
  (s ?? "").replace(/^(?:Mesa\s*)+/i, "").trim();

type WItem = {
  id: string;
  name: string;
  price: number;
  category_id: string;
  category_name: string;
};

type Line = {
  itemId: string;
  productId: string;
  name: string;
  price: number;
  qty: number;
  notes: string;
  modifiers: SelectedModifier[];
};

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
    (tablesQ.data?.[0] as any)?.restaurant_id ?? (ordersQ.data?.[0] as any)?.restaurant_id;

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

  const tables = (tablesQ.data ?? []) as any[];
  const orders = (ordersQ.data ?? []) as any[];
  const calls = (callsQ.data ?? []) as any[];

  const sorted = useMemo(
    () =>
      [...tables].sort((a, b) =>
        String(a.label).localeCompare(String(b.label), "pt", { numeric: true }),
      ),
    [tables],
  );

  const activeByLabel = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const o of orders) {
      if (!ACTIVE.includes(o.status)) continue;
      if (o.archived) continue;
      const key = normalizeLabel(o.table_label);
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
      const key = normalizeLabel(c.table_label);
      if (!key) continue;
      const arr = m.get(key) ?? [];
      arr.push({ id: c.id, kind: (c.kind === "bill" ? "bill" : "call") as any });
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
            {calls.map((c: any) => (
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
        {sorted.map((t: any) => {
          const stripped = normalizeLabel(t.label);
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
            createdByName={session.name}
            staffToken={session.token}
            onClose={() => setOpenTable(null)}
            onDone={() => qc.invalidateQueries({ queryKey: ["staff-orders", session.token] })}
          />
        )}
        {billTable &&
          (() => {
            const key = normalizeLabel(billTable);
            const tableOrders = activeByLabel.get(key) ?? [];
            const t = sorted.find((x: any) => x.label === billTable);
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

function QuickOrderModal({
  tableId,
  tableLabel,
  restaurantId,
  currency,
  createdByName,
  staffToken,
  onClose,
  onDone,
}: {
  tableId: string;
  tableLabel: string;
  restaurantId: string;
  currency: string;
  createdByName: string;
  staffToken: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [pickerItem, setPickerItem] = useState<WItem | null>(null);
  const modifiers = useQuery({
    queryKey: ["modifiers", restaurantId],
    queryFn: () => fetchModifiersForRestaurant(restaurantId),
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ["staff-waiter-items", restaurantId],
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

  function addConfigured(it: WItem, selected: SelectedModifier[] = []) {
    const key =
      it.id +
      ":" +
      selected
        .map((m) => m.id)
        .sort()
        .join(",");
    setLines((prev) => {
      const existing = prev.find((l) => l.itemId === key);
      if (existing)
        return prev.map((l) => (l.itemId === key ? { ...l, qty: Math.min(99, l.qty + 1) } : l));
      return [
        ...prev,
        {
          itemId: key,
          productId: it.id,
          name: it.name,
          price: it.price + selected.reduce((sum, m) => sum + m.price_delta, 0),
          qty: 1,
          notes: "",
          modifiers: selected,
        },
      ];
    });
  }
  function addItem(it: WItem) {
    if (modifiers.isPending) {
      toast.info("Carregando adicionais");
      return;
    }
    if (modifiers.isError) {
      toast.error("Não foi possível carregar adicionais");
      return;
    }
    if (modifiers.data?.get(it.id)?.length) setPickerItem(it);
    else addConfigured(it);
  }

  function setQty(id: string, qty: number) {
    if (qty <= 0) return setLines((p) => p.filter((l) => l.itemId !== id));
    setLines((p) => p.map((l) => (l.itemId === id ? { ...l, qty } : l)));
  }

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);

  async function submit() {
    if (lines.length === 0) return;
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).rpc("staff_place_order", {
        p_token: staffToken,
        p_table_id: tableId,
        p_items: lines.map((l) => ({
          menu_item_id: l.productId,
          quantity: l.qty,
          notes: l.notes || null,
          modifier_option_ids: l.modifiers.map((m) => m.id),
        })),
      });
      if (error) throw error;
      toast.success(`Pedido enviado · ${tableLabel}`, {
        description: `${lines.reduce((s, l) => s + l.qty, 0)} item(s) · ${fmt(subtotal, currency)}`,
      });
      onDone();
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
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Lançamento rápido
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
                        {it.category_name} · {fmt(it.price, currency)}
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
                        <span className="min-w-[1.5rem] text-center text-sm font-medium">
                          {ex.qty}
                        </span>
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
                <li className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum item encontrado.
                </li>
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
                      setLines((p) =>
                        p.map((x) => (x.itemId === l.itemId ? { ...x, notes: e.target.value } : x)),
                      )
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
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Subtotal
              </div>
              <div className="font-display text-xl tracking-tight">{fmt(subtotal, currency)}</div>
            </div>
            <button
              onClick={submit}
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
      <ModifierPicker
        item={pickerItem}
        groups={pickerItem ? (modifiers.data?.get(pickerItem.id) ?? []) : []}
        currency={currency}
        onClose={() => setPickerItem(null)}
        onConfirm={(selected) => {
          if (pickerItem) addConfigured(pickerItem, selected);
          setPickerItem(null);
        }}
      />
    </motion.div>
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
  orders: any[];
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
        (ss: number, it: any) => ss + Number(it.price ?? 0) * Number(it.quantity ?? 0),
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
                  (s: number, it: any) => s + Number(it.price ?? 0) * Number(it.quantity ?? 0),
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
                      {(o.items ?? []).map((it: any) => (
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
