import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Trash2,
  QrCode as QrIcon,
  Users,
  Armchair,
  ExternalLink,
  History,
  X,
} from "lucide-react";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { useOrders } from "@/features/orders/order-queries";
import {
  useCreateManyTables,
  useCreateTable,
  useDeleteTable,
  useTables,
  type VenueTable,
} from "@/features/tables/table-queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTrialStatus, canAccess, FeatureLocked } from "@/features/billing/trial-guard";
import { getTableLimit } from "@/features/staff/staff-picker";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/tables")({
  head: () => ({ meta: [{ title: "Mesas — Flux" }] }),
  component: TablesPage,
});

const OCCUPIED_STATUSES = ["pending", "accepted", "preparing", "ready"] as const;

// Normaliza "Mesa 1", "Mesa Mesa 1", "  Mesa   1  " → "1"
const normalizeLabel = (s: string | null | undefined) =>
  (s ?? "").replace(/^(?:Mesa\s*)+/i, "").trim();

type HistoryOrder = Tables<"orders"> & { order_items: Tables<"order_items">[] };

function useTableHistory(restaurantId: string | undefined) {
  return useQuery({
    queryKey: ["table-history", restaurantId],
    enabled: !!restaurantId,
    queryFn: async (): Promise<HistoryOrder[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("restaurant_id", restaurantId!)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as HistoryOrder[];
    },
  });
}

function TablesPage() {
  const { data: restaurant, isLoading: rLoading } = useRestaurant();
  const { data: tables = [], isLoading: tLoading } = useTables(restaurant?.id);
  const { data: orders = [] } = useOrders(restaurant?.id);
  const { data: history = [] } = useTableHistory(restaurant?.id);
  const { data: trial } = useTrialStatus();
  const tableLimit = getTableLimit(trial?.plan_type);
  const reachedLimit = tables.length >= tableLimit;

  const createOne = useCreateTable(restaurant?.id);
  const createMany = useCreateManyTables(restaurant?.id);
  const del = useDeleteTable(restaurant?.id);

  const [label, setLabel] = useState("");
  const [bulk, setBulk] = useState({ from: 1, to: 10, prefix: "Mesa" });
  const [filter, setFilter] = useState<"all" | "free" | "busy">("all");
  const [historyTable, setHistoryTable] = useState<VenueTable | null>(null);


  const currency = restaurant?.currency || "BRL";
  const fmt = useMemo(
    () => new Intl.NumberFormat("pt-BR", { style: "currency", currency }),
    [currency],
  );

  const orderTotal = (o: { subtotal: number | null; service_fee: number | null; cover_charge: number | null }) =>
    Number(o.subtotal ?? 0) + Number(o.service_fee ?? 0) + Number(o.cover_charge ?? 0);

  // Ocupação atual (por label normalizado)
  const occupancy = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const o of orders) {
      if (!o.table_label) continue;
      if (!(OCCUPIED_STATUSES as readonly string[]).includes(o.status)) continue;
      const key = normalizeLabel(o.table_label);
      const cur = map.get(key) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += orderTotal(o);
      map.set(key, cur);
    }
    return map;
  }, [orders]);

  // Faturamento histórico por label normalizado
  const revenueByTable = useMemo(() => {
    const map = new Map<string, { total: number; orders: number }>();
    for (const o of history) {
      if (!o.table_label) continue;
      const key = normalizeLabel(o.table_label);
      const cur = map.get(key) ?? { total: 0, orders: 0 };
      cur.total += orderTotal(o);
      cur.orders += 1;
      map.set(key, cur);
    }
    return map;
  }, [history]);

  if (rLoading || !restaurant) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const busyCount = tables.filter((t) => occupancy.has(normalizeLabel(t.label))).length;
  const freeCount = tables.length - busyCount;

  const filtered = tables.filter((t) => {
    const busy = occupancy.has(normalizeLabel(t.label));
    if (filter === "busy") return busy;
    if (filter === "free") return !busy;
    return true;
  });

  const handleCreate = async () => {
    const trimmed = label.trim();
    if (!trimmed) {
      toast.error("Informe um nome para a mesa");
      return;
    }
    if (reachedLimit) {
      toast.error(`Plano atual permite até ${tableLimit} mesas`);
      return;
    }
    try {
      await createOne.mutateAsync({ label: trimmed });
      setLabel("");
      toast.success("Mesa criada");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleBulk = async () => {
    if (bulk.from > bulk.to) {
      toast.error("Intervalo inválido");
      return;
    }
    const willCreate = bulk.to - bulk.from + 1;
    if (tables.length + willCreate > tableLimit) {
      toast.error(`Plano atual permite até ${tableLimit} mesas`);
      return;
    }
    try {
      await createMany.mutateAsync(bulk);
      toast.success(`${willCreate} mesas criadas`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDelete = async (t: VenueTable) => {
    if (occupancy.has(normalizeLabel(t.label))) {
      toast.error("Mesa ocupada não pode ser removida");
      return;
    }
    if (!confirm(`Remover ${t.label}?`)) return;
    try {
      await del.mutateAsync(t.id);
      toast.success("Mesa removida");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mesas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie as mesas do seu salão e acompanhe a ocupação em tempo real.
          </p>
        </div>
        <Link
          to="/qrcodes"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm transition hover:-translate-y-0.5 hover:text-foreground"
        >
          <QrIcon className="h-4 w-4" /> QR Codes
        </Link>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={<Armchair className="h-4 w-4" />}
          label="Total de mesas"
          value={String(tables.length)}
          hint={`Limite do plano: ${tableLimit}`}
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Ocupadas agora"
          value={`${busyCount} / ${tables.length}`}
          hint={busyCount > 0 ? "Com pedidos ativos" : "Nenhuma mesa ocupada"}
          tone="busy"
        />
        <StatCard
          icon={<Armchair className="h-4 w-4" />}
          label="Livres"
          value={String(freeCount)}
          hint="Disponíveis"
          tone="free"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Adicionar mesa</h2>
          <p className="mt-1 text-xs text-muted-foreground">Crie uma mesa individual com nome personalizado.</p>
          <div className="mt-4 flex gap-2">
            <Input
              placeholder="Ex.: Mesa 12, Varanda 3"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <Button onClick={handleCreate} disabled={createOne.isPending || reachedLimit}>
              <Plus className="h-4 w-4" /> Criar
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Criar em lote</h2>
          <p className="mt-1 text-xs text-muted-foreground">Gere várias mesas numeradas de uma só vez.</p>
          <div className="mt-4 grid grid-cols-[1fr_80px_80px_auto] gap-2">
            <Input
              placeholder="Prefixo"
              value={bulk.prefix}
              onChange={(e) => setBulk((b) => ({ ...b, prefix: e.target.value }))}
            />
            <Input
              type="number"
              min={1}
              value={bulk.from}
              onChange={(e) => setBulk((b) => ({ ...b, from: Number(e.target.value) }))}
            />
            <Input
              type="number"
              min={1}
              value={bulk.to}
              onChange={(e) => setBulk((b) => ({ ...b, to: Number(e.target.value) }))}
            />
            <Button onClick={handleBulk} disabled={createMany.isPending || reachedLimit} variant="secondary">
              <Plus className="h-4 w-4" /> Criar
            </Button>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Salão</h2>
          <div className="inline-flex rounded-lg border border-border bg-surface p-1 text-xs">
            {(["all", "free", "busy"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md px-3 py-1.5 transition",
                  filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f === "all" ? "Todas" : f === "free" ? "Livres" : `Ocupadas (${busyCount})`}
              </button>
            ))}
          </div>
        </div>

        {tLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tables.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((t) => {
              const key = normalizeLabel(t.label);
              const occ = occupancy.get(key);
              const rev = revenueByTable.get(key);
              const busy = !!occ;
              return (
                <article
                  key={t.id}
                  className={cn(
                    "group relative overflow-hidden rounded-2xl border bg-surface p-5 transition hover:-translate-y-0.5",
                    busy
                      ? "border-[oklch(0.78_0.13_84_/_0.4)] ring-1 ring-[oklch(0.78_0.13_84_/_0.2)]"
                      : "border-border",
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">
                        Código {t.short_code}
                      </div>
                      <h3 className="mt-1 text-lg font-semibold">{t.label}</h3>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                        busy ? "bg-gold-soft text-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {busy ? "Ocupada" : "Livre"}
                    </span>
                  </div>

                  <div className="mt-4 min-h-[44px] text-sm">
                    {busy ? (
                      <div className="space-y-0.5">
                        <div className="text-foreground">
                          {occ!.count} pedido{occ!.count > 1 ? "s" : ""} ativo{occ!.count > 1 ? "s" : ""}
                        </div>
                        <div className="text-muted-foreground">Conta atual: {fmt.format(occ!.total)}</div>
                      </div>
                    ) : (
                      <div className="text-muted-foreground">Aguardando clientes</div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">Faturamento total</span>
                    <span className="font-semibold tabular-nums">{fmt.format(rev?.total ?? 0)}</span>
                  </div>

                  <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
                    <button
                      onClick={() => setHistoryTable(t)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium transition hover:text-foreground"
                    >
                      <History className="h-3.5 w-3.5" /> Histórico
                    </button>
                    <a
                      href={`/m/${restaurant.slug}?table=${encodeURIComponent(t.label)}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir cardápio"
                      className="inline-flex items-center justify-center rounded-lg border border-border bg-background p-2 text-muted-foreground transition hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      onClick={() => handleDelete(t)}
                      disabled={busy}
                      title={busy ? "Mesa ocupada" : "Remover"}
                      className="inline-flex items-center justify-center rounded-lg border border-border bg-background p-2 text-muted-foreground transition hover:text-destructive disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <HistoryModal
        table={historyTable}
        onClose={() => setHistoryTable(null)}
        history={history}
        fmt={fmt}
        orderTotal={orderTotal}
      />
    </div>
  );
}

function HistoryModal({
  table,
  onClose,
  history,
  fmt,
  orderTotal,
}: {
  table: VenueTable | null;
  onClose: () => void;
  history: HistoryOrder[];
  fmt: Intl.NumberFormat;
  orderTotal: (o: { subtotal: number | null; service_fee: number | null; cover_charge: number | null }) => number;
}) {
  const key = table ? normalizeLabel(table.label) : "";
  const tableOrders = useMemo(
    () => (table ? history.filter((o) => normalizeLabel(o.table_label) === key) : []),
    [history, table, key],
  );
  const total = tableOrders.reduce((s, o) => s + orderTotal(o), 0);

  // Agrupa por "conta" (sessão entre liberações) – heurística: pedidos do mesmo dia consecutivos
  // Para simplicidade: agrupar por dia.
  const grouped = useMemo(() => {
    const map = new Map<string, HistoryOrder[]>();
    for (const o of tableOrders) {
      const d = new Date(o.created_at);
      const k = d.toLocaleDateString("pt-BR");
      const arr = map.get(k) ?? [];
      arr.push(o);
      map.set(k, arr);
    }
    return Array.from(map.entries());
  }, [tableOrders]);

  return (
    <Dialog open={!!table} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle>Histórico — {table?.label}</DialogTitle>
              <DialogDescription className="mt-1">
                {tableOrders.length} pedido{tableOrders.length === 1 ? "" : "s"} no total
              </DialogDescription>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Faturamento total</div>
              <div className="text-xl font-semibold tabular-nums">{fmt.format(total)}</div>
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto px-6 py-4">
          {tableOrders.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum pedido registrado para esta mesa ainda.
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([day, orders]) => {
                const dayTotal = orders.reduce((s, o) => s + orderTotal(o), 0);
                return (
                  <div key={day}>
                    <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                      <span>{day}</span>
                      <span className="tabular-nums">{fmt.format(dayTotal)}</span>
                    </div>
                    <div className="space-y-3">
                      {orders.map((o) => (
                        <article key={o.id} className="rounded-xl border border-border bg-surface p-4">
                          <header className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium">
                                {o.customer_name || "Cliente"}
                                <span className="ml-2 text-xs uppercase text-muted-foreground">
                                  {o.status}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(o.created_at).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold tabular-nums">
                                {fmt.format(orderTotal(o))}
                              </div>
                            </div>
                          </header>
                          <ul className="mt-3 space-y-1 text-sm">
                            {o.order_items.map((it) => (
                              <li key={it.id} className="flex justify-between gap-3 text-muted-foreground">
                                <span>
                                  <span className="text-foreground">{it.quantity}×</span>{" "}
                                  {it.name_snapshot}
                                  {it.notes ? (
                                    <span className="ml-1 text-xs">— {it.notes}</span>
                                  ) : null}
                                </span>
                                <span className="tabular-nums">
                                  {fmt.format(Number(it.price_snapshot) * it.quantity)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "busy" | "free";
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-lg",
            tone === "busy" ? "bg-gold-soft text-foreground" : "bg-muted",
          )}
        >
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-soft">
        <Armchair className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h3 className="text-base font-semibold">Nenhuma mesa cadastrada</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Crie sua primeira mesa acima para começar a receber pedidos pelo QR Code.
        </p>
      </div>
    </div>
  );
}
