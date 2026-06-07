import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Loader2,
  TrendingUp,
  Receipt,
  Users,
  Clock,
  Trophy,
  Download,
  CheckCircle2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { useOrders, STATUS_LABELS, type Order, type OrderStatus } from "@/features/orders/order-queries";
import { formatPrice } from "@/routes/_authenticated/menu";
import { cn } from "@/lib/utils";
import { useTrialStatus, canAccess, FeatureLocked } from "@/features/billing/trial-guard";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Análises — Flux" }] }),
  component: AnalyticsPage,
});

type Range = "7d" | "30d" | "90d";

const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };
const RANGE_LABELS: Record<Range, string> = {
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function AnalyticsPage() {
  const navigate = useNavigate();
  const { data: restaurant, isLoading: rLoading } = useRestaurant();
  const { data: orders = [], isLoading: oLoading } = useOrders(restaurant?.id);
  const { data: trial } = useTrialStatus();
  const [range, setRange] = useState<Range>("7d");
  const [selected, setSelected] = useState<Order | null>(null);

  // Pedidos arquivados (concluidos/realizados) — não vêm via useOrders.
  const { data: archivedOrders = [] } = useQuery({
    queryKey: ["orders-archived", restaurant?.id, range],
    enabled: !!restaurant?.id,
    queryFn: async (): Promise<Order[]> => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      since.setDate(since.getDate() - (RANGE_DAYS[range] - 1));
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("restaurant_id", restaurant!.id)
        .eq("archived", true as any)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });

  useEffect(() => {
    if (!rLoading && !restaurant) navigate({ to: "/onboarding" });
  }, [rLoading, restaurant, navigate]);

  const stats = useMemo(() => {
    const days = RANGE_DAYS[range];
    const since = startOfDay(new Date());
    since.setDate(since.getDate() - (days - 1));

    // Universo completo (ativos + arquivados) para o período.
    const all: Order[] = [...orders, ...archivedOrders];
    const paid = all.filter(
      (o) => o.status !== "cancelled" && new Date(o.created_at) >= since,
    );

    // Receita Realizada = pedido finalizado (concluded ≡ archived=true)
    // Receita Provisionada = entregue (status=served) porém ainda não fechado.
    const realizedRevenue = paid
      .filter((o) => (o as any).archived === true)
      .reduce((s, o) => s + Number(o.subtotal || 0), 0);
    const provisionedRevenue = paid
      .filter((o) => (o as any).archived !== true && o.status === "served")
      .reduce((s, o) => s + Number(o.subtotal || 0), 0);
    const revenue = realizedRevenue + provisionedRevenue;
    const count = paid.length;
    const avg = count ? revenue / count : 0;

    const customers = new Set(
      paid.map((o) => `${o.table_label ?? "-"}|${o.customer_name ?? "-"}`),
    ).size;

    // Per-day buckets (separa realizada vs provisionada)
    const perDay = Array.from({ length: days }, (_, i) => {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      return { date: d, revenue: 0, realized: 0, provisioned: 0, count: 0 };
    });
    paid.forEach((o) => {
      const idx = Math.floor(
        (startOfDay(new Date(o.created_at)).getTime() - since.getTime()) / 86_400_000,
      );
      if (idx >= 0 && idx < perDay.length) {
        const v = Number(o.subtotal || 0);
        perDay[idx].revenue += v;
        perDay[idx].count += 1;
        if ((o as any).archived === true) perDay[idx].realized += v;
        else if (o.status === "served") perDay[idx].provisioned += v;
      }
    });

    // Top items
    const itemMap = new Map<string, { name: string; qty: number; revenue: number }>();
    paid.forEach((o) =>
      o.order_items.forEach((it) => {
        const key = it.name_snapshot;
        const cur = itemMap.get(key) ?? { name: key, qty: 0, revenue: 0 };
        cur.qty += it.quantity;
        cur.revenue += Number(it.price_snapshot) * it.quantity;
        itemMap.set(key, cur);
      }),
    );
    const topItems = Array.from(itemMap.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);

    // Hour heatmap (0-23)
    const perHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
    paid.forEach((o) => {
      const h = new Date(o.created_at).getHours();
      perHour[h].count += 1;
    });
    const maxHour = Math.max(1, ...perHour.map((h) => h.count));

    // Status breakdown across the range
    const statusCount: Record<OrderStatus, number> = {
      pending: 0,
      accepted: 0,
      preparing: 0,
      ready: 0,
      served: 0,
      cancelled: 0,
    };
    all
      .filter((o) => new Date(o.created_at) >= since)
      .forEach((o) => {
        statusCount[o.status] += 1;
      });

    return {
      revenue,
      realizedRevenue,
      provisionedRevenue,
      count,
      avg,
      customers,
      perDay,
      topItems,
      perHour,
      maxHour,
      statusCount,
      since,
    };
  }, [orders, archivedOrders, range]);

  if (rLoading || !restaurant) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currency = restaurant.currency || "BRL";
  const maxRevenue = Math.max(1, ...stats.perDay.map((d) => d.revenue));

  // Universo completo usado nas tabelas e exportação.
  const allOrders = useMemo(
    () => [...orders, ...archivedOrders],
    [orders, archivedOrders],
  );

  const exportCsv = () => {
    const rows = [
      ["Data", "Mesa", "Cliente", "Status", "Receita", "Subtotal", "Itens"],
      ...allOrders
        .filter((o) => new Date(o.created_at) >= stats.since)
        .map((o) => [
          new Date(o.created_at).toLocaleString("pt-BR"),
          o.table_label ?? "",
          o.customer_name ?? "",
          STATUS_LABELS[o.status],
          (o as any).archived === true
            ? "Realizada"
            : o.status === "served"
              ? "Provisionada"
              : "Em aberto",
          String(o.subtotal),
          o.order_items.map((i) => `${i.quantity}x ${i.name_snapshot}`).join(" | "),
        ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replaceAll(`"`, `""`)}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flux-${restaurant.slug}-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (trial && !canAccess(trial, "analytics")) {
    return (
      <div className="mx-auto w-full max-w-4xl py-10">
        <FeatureLocked feature="analytics" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-primary">Análises</p>
          <h1 className="mt-2 font-display text-4xl tracking-tight">
            Pulso do <span className="text-gradient-gold italic">negócio</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Receita, pedidos e horários de pico em tempo real.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-border bg-surface p-1">
            {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  range === r
                    ? "bg-gold-soft text-foreground ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
          <button
            onClick={exportCsv}
            disabled={stats.count === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition hover:-translate-y-0.5 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 stagger sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Receita realizada"
          value={formatPrice(stats.realizedRevenue, currency)}
          hint="Contas fechadas no período"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Receita provisionada"
          value={formatPrice(stats.provisionedRevenue, currency)}
          hint="Entregues, ainda em aberto"
        />
        <KpiCard
          icon={<Receipt className="h-4 w-4" />}
          label="Pedidos"
          value={String(stats.count)}
        />
        <KpiCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Ticket médio"
          value={formatPrice(stats.avg, currency)}
        />
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Clientes únicos"
          value={String(stats.customers)}
        />
      </div>

      {/* Revenue chart */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl tracking-tight">Receita diária</h2>
            <p className="text-xs text-muted-foreground">{RANGE_LABELS[range]}</p>
          </div>
        </div>
        <div className="mt-6 flex h-56 items-end gap-1.5">
          {stats.perDay.map((d, i) => {
            const h = (d.revenue / maxRevenue) * 100;
            return (
              <motion.div
                key={i}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: `${Math.max(2, h)}%`, opacity: 1 }}
                transition={{ duration: 0.6, delay: i * 0.02, ease: [0.22, 1, 0.36, 1] }}
                className="group relative flex-1 rounded-t-md bg-gradient-to-t from-[oklch(0.78_0.13_84_/_0.4)] to-[oklch(0.86_0.14_84)] hover:from-[oklch(0.78_0.13_84_/_0.6)]"
              >
                <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-background px-2 py-1 text-[10px] opacity-0 ring-1 ring-border transition group-hover:opacity-100">
                  {formatPrice(d.revenue, currency)} · {d.count}
                </div>
              </motion.div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>
            {stats.perDay[0]?.date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
          </span>
          <span>
            {stats.perDay[stats.perDay.length - 1]?.date.toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "short",
            })}
          </span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* Top items */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <h2 className="font-display text-xl tracking-tight">Itens mais vendidos</h2>
          </div>
          {stats.topItems.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Sem dados no período.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {stats.topItems.map((it, i) => {
                const max = stats.topItems[0].qty;
                const w = (it.qty / max) * 100;
                return (
                  <li key={it.name} className="group">
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gold-soft text-[11px] font-semibold text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
                          {i + 1}
                        </span>
                        <span className="truncate">{it.name}</span>
                      </div>
                      <div className="flex items-baseline gap-3 text-xs text-muted-foreground">
                        <span className="text-foreground">{it.qty}x</span>
                        <span>{formatPrice(it.revenue, currency)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-background">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${w}%` }}
                        transition={{ duration: 0.7, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full rounded-full bg-gradient-to-r from-[oklch(0.78_0.13_84_/_0.5)] to-[oklch(0.86_0.14_84)]"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Hourly heatmap */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h2 className="font-display text-xl tracking-tight">Horários de pico</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Distribuição de pedidos por hora.</p>
          <div className="mt-5 grid grid-cols-12 gap-1">
            {stats.perHour.map((h) => {
              const intensity = h.count / stats.maxHour;
              return (
                <div
                  key={h.hour}
                  title={`${h.hour}h — ${h.count} pedidos`}
                  className="flex aspect-square items-center justify-center rounded-md text-[9px] font-medium ring-1 ring-border"
                  style={{
                    background: `oklch(0.78 0.13 84 / ${0.08 + intensity * 0.55})`,
                    color: intensity > 0.5 ? "oklch(0.18 0.02 70)" : "oklch(0.65 0.02 70)",
                  }}
                >
                  {h.hour}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* History table */}
      <section className="rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border p-6">
          <div>
            <h2 className="font-display text-xl tracking-tight">Histórico de pedidos</h2>
            <p className="text-xs text-muted-foreground">Clique em qualquer linha para ver os detalhes.</p>
          </div>
        </div>
        {oLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : allOrders.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Nenhum pedido ainda. Quando seus clientes começarem a pedir, eles aparecerão aqui.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left font-medium">Quando</th>
                  <th className="px-6 py-3 text-left font-medium">Mesa</th>
                  <th className="px-6 py-3 text-left font-medium">Cliente</th>
                  <th className="px-6 py-3 text-left font-medium">Itens</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                  <th className="px-6 py-3 text-left font-medium">Receita</th>
                  <th className="px-6 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {allOrders
                  .filter((o) => new Date(o.created_at) >= stats.since)
                  .slice(0, 100)
                  .map((o) => {
                    const isRealized = (o as any).archived === true;
                    const isProvisioned = !isRealized && o.status === "served";
                    return (
                      <tr
                        key={o.id}
                        onClick={() => setSelected(o)}
                        className="cursor-pointer border-b border-border/60 transition hover:bg-background"
                      >
                        <td className="px-6 py-3 text-muted-foreground">
                          {new Date(o.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-6 py-3">{o.table_label ?? "—"}</td>
                        <td className="px-6 py-3 truncate">{o.customer_name ?? "—"}</td>
                        <td className="px-6 py-3 text-muted-foreground">
                          {o.order_items.reduce((s, i) => s + i.quantity, 0)}
                        </td>
                        <td className="px-6 py-3">
                          <StatusPill status={o.status} />
                        </td>
                        <td className="px-6 py-3">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ring-1",
                              isRealized
                                ? "bg-emerald-500/10 text-emerald-400 ring-emerald-400/30"
                                : isProvisioned
                                  ? "bg-[oklch(0.78_0.13_84_/_0.15)] text-primary ring-[oklch(0.78_0.13_84_/_0.3)]"
                                  : "bg-background text-muted-foreground ring-border",
                            )}
                          >
                            {isRealized ? "Realizada" : isProvisioned ? "Provisionada" : "Em aberto"}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right font-medium">
                          {formatPrice(Number(o.subtotal), currency)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

        )}
      </section>

      {selected && (
        <OrderModal order={selected} currency={currency} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-border bg-surface p-5 hover-lift"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-soft text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
          {icon}
        </span>
      </div>
      <div className="mt-3 font-display text-2xl tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </motion.div>
  );
}

function StatusPill({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, string> = {
    pending: "bg-[oklch(0.78_0.13_84_/_0.15)] text-[oklch(0.86_0.14_84)]",
    accepted: "bg-[oklch(0.65_0.18_250_/_0.15)] text-[oklch(0.78_0.18_250)]",
    preparing: "bg-[oklch(0.7_0.18_55_/_0.15)] text-[oklch(0.82_0.18_55)]",
    ready: "bg-[oklch(0.7_0.18_150_/_0.15)] text-[oklch(0.82_0.18_150)]",
    served: "bg-[oklch(0.5_0.02_60_/_0.2)] text-muted-foreground",
    cancelled: "bg-[oklch(0.62_0.21_25_/_0.15)] text-[oklch(0.78_0.18_25)]",
  };
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider", map[status])}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function OrderModal({
  order,
  currency,
  onClose,
}: {
  order: Order;
  currency: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Pedido</p>
            <h3 className="mt-1 font-display text-2xl tracking-tight">
              {order.table_label ?? "—"} · {order.customer_name ?? "—"}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(order.created_at).toLocaleString("pt-BR")}
            </p>
          </div>
          <StatusPill status={order.status} />
        </div>
        <ul className="mt-5 max-h-80 space-y-2 overflow-y-auto pr-1">
          {order.order_items.map((it) => {
            const mods = (it.modifiers_snapshot as Array<{ name: string }> | null) ?? [];
            return (
              <li
                key={it.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-background/40 p-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate">
                    <span className="text-muted-foreground">{it.quantity}× </span>
                    {it.name_snapshot}
                  </div>
                  {mods.length > 0 && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {mods.map((m) => m.name).join(" · ")}
                    </div>
                  )}
                  {it.notes && (
                    <div className="mt-0.5 italic text-[11px] text-muted-foreground">"{it.notes}"</div>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatPrice(Number(it.price_snapshot) * it.quantity, currency)}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Total</span>
          <span className="font-display text-2xl tracking-tight">
            {formatPrice(Number(order.subtotal), currency)}
          </span>
        </div>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-xl border border-border bg-background py-2.5 text-sm font-medium transition hover:bg-surface-2"
        >
          Fechar
        </button>
      </motion.div>
    </div>
  );
}
