import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Bell, DollarSign, Receipt, Users, Flame, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { useOrders, STATUS_LABELS, type Order } from "@/features/orders/order-queries";
import { useWaiterCalls, useResolveWaiterCall } from "@/features/waiter/waiter-queries";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/routes/_authenticated/menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard — Flux" }],
  }),
  component: DashboardPage,
});

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function DashboardPage() {
  const { user } = useAuth();
  const { data: restaurant } = useRestaurant();
  const { data: orders } = useOrders(restaurant?.id);
  const currency = restaurant?.currency ?? "BRL";

  const { data: tablesCount } = useQuery({
    queryKey: ["tables-count", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { count } = await supabase
        .from("venue_tables")
        .select("*", { count: "exact", head: true })
        .eq("restaurant_id", restaurant!.id);
      return count ?? 0;
    },
  });

  const stats = useMemo(() => {
    const today = startOfToday().getTime();
    const validOrders = (orders ?? []).filter((o) => o.status !== "cancelled");
    const todayOrders = validOrders.filter(
      (o) => new Date(o.created_at).getTime() >= today,
    );
    const revenue = todayOrders.reduce((s, o) => s + Number(o.subtotal), 0);
    const activeTables = new Set(
      validOrders
        .filter((o) => o.status !== "served")
        .map((o) => o.table_label)
        .filter(Boolean),
    ).size;

    const itemCounts = new Map<string, number>();
    todayOrders.forEach((o) =>
      o.order_items.forEach((it) => {
        itemCounts.set(it.name_snapshot, (itemCounts.get(it.name_snapshot) ?? 0) + it.quantity);
      }),
    );
    let topItem = "—";
    let topQty = 0;
    itemCounts.forEach((q, name) => {
      if (q > topQty) {
        topQty = q;
        topItem = name;
      }
    });

    return { revenue, ordersCount: todayOrders.length, activeTables, topItem, topQty };
  }, [orders]);

  const recent = (orders ?? []).slice(0, 6);

  // 7-day revenue series
  const series = useMemo(() => {
    const days: { label: string; total: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const total = (orders ?? [])
        .filter(
          (o) =>
            o.status !== "cancelled" &&
            new Date(o.created_at) >= d &&
            new Date(o.created_at) < next,
        )
        .reduce((s, o) => s + Number(o.subtotal), 0);
      days.push({
        label: d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
        total,
      });
    }
    return days;
  }, [orders]);

  const maxSeries = Math.max(1, ...series.map((s) => s.total));

  const name = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "por aí";
  const ctaTo = restaurant ? "/menu" : "/onboarding";
  const ctaLabel = restaurant ? "Gerenciar cardápio" : "Configurar restaurante";

  const hour = new Date().getHours();
  const greeting =
    hour < 5 ? "Boa madrugada" : hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  const STATS = [
    {
      label: "Receita hoje",
      value: formatPrice(stats.revenue, currency),
      delta: `${stats.ordersCount} ${stats.ordersCount === 1 ? "pedido" : "pedidos"}`,
      icon: DollarSign,
    },
    {
      label: "Pedidos hoje",
      value: String(stats.ordersCount),
      delta: stats.ordersCount > 0 ? "Em tempo real" : "Aguardando primeiro pedido",
      icon: Receipt,
    },
    {
      label: "Mesas ativas",
      value: `${stats.activeTables} / ${tablesCount ?? 0}`,
      delta: stats.activeTables > 0 ? "Com pedidos abertos" : "Sem mesas ocupadas",
      icon: Users,
    },
    {
      label: "Item destaque",
      value: stats.topItem,
      delta: stats.topQty > 0 ? `${stats.topQty} vendidos hoje` : "Aguardando vendas",
      icon: Flame,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-primary">Visão geral</p>
          <h1 className="mt-2 font-display text-4xl tracking-tight">
            {greeting}, <span className="text-gradient-gold italic">{name}</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Veja como o seu estabelecimento está performando hoje.
          </p>
        </div>
        <Link
          to={ctaTo}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 hover:-translate-y-0.5"
        >
          {ctaLabel}
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-4 stagger sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map(({ label, value, delta, icon: Icon }) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-surface p-5 hover-lift hover:border-[oklch(0.78_0.13_84_/_0.3)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-3 truncate font-display text-3xl tracking-tight">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{delta}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-6 animate-fade-up lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl tracking-tight">Receita (7 dias)</h2>
              <p className="text-xs text-muted-foreground">
                Atualizado em tempo real conforme os pedidos chegam.
              </p>
            </div>
            <span className="rounded-full bg-gold-soft px-3 py-1 text-xs text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]">
              Ao vivo
            </span>
          </div>
          <div className="mt-6 flex h-56 items-end gap-2">
            {series.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-md bg-gradient-to-t from-[oklch(0.78_0.13_84_/_0.1)] to-[oklch(0.78_0.13_84_/_0.45)] transition-all duration-700"
                  style={{ height: `${Math.max(4, (d.total / maxSeries) * 100)}%` }}
                  title={formatPrice(d.total, currency)}
                />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {d.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 animate-fade-up">
          <h2 className="font-display text-xl tracking-tight">Comece por aqui</h2>
          <p className="mt-1 text-xs text-muted-foreground">Conclua estes passos para ficar no ar.</p>
          <ul className="mt-5 space-y-3 text-sm stagger">
            {[
              "Crie o perfil do restaurante",
              "Adicione categorias e itens",
              "Gere QR codes para as mesas",
              "Abra o painel da cozinha",
            ].map((step, i) => (
              <li
                key={step}
                className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 transition hover:border-[oklch(0.78_0.13_84_/_0.3)]"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-[11px] text-muted-foreground">
                  {i + 1}
                </span>
                <span className="text-muted-foreground">{step}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6 animate-fade-up">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl tracking-tight">Atividade recente</h2>
          <span className="text-xs text-muted-foreground">
            {recent.length > 0 ? `${recent.length} mais recentes` : "Sem atividade ainda"}
          </span>
        </div>
        {recent.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-4 text-sm font-medium">Nenhum pedido ainda</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Quando os clientes escanearem um QR e fizerem um pedido, ele aparecerá aqui em tempo real.
            </p>
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-border">
            {recent.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {o.table_label ?? "Balcão"}
                    {o.customer_name ? ` · ${o.customer_name}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {o.order_items.length} {o.order_items.length === 1 ? "item" : "itens"} ·{" "}
                    {new Date(o.created_at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-background px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground ring-1 ring-border">
                    {o.status}
                  </span>
                  <span className="font-display text-base tracking-tight">
                    {formatPrice(Number(o.subtotal), currency)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
