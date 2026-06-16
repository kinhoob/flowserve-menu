import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Bell, DollarSign, Receipt, Users, Flame, Loader2, Store } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { useOrders, STATUS_LABELS, type Order } from "@/features/orders/order-queries";
import { useWaiterCalls, useResolveWaiterCall } from "@/features/waiter/waiter-queries";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/routes/_authenticated/menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdminTour } from "@/features/onboarding/admin-tour";
import { WelcomeRestaurantModal } from "@/features/onboarding/welcome-restaurant-modal";
import {
  useTrialStatus,
  isTrialExpired,
  TrialExpiredBlock,
  TrialBanner,
} from "@/features/billing/trial-guard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: (search: Record<string, unknown>): { checkout?: string; session_id?: string } => ({
    checkout: typeof search.checkout === "string" ? search.checkout : undefined,
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
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
  const { checkout: checkoutStatus } = Route.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    if (checkoutStatus === "success") {
      toast.success("Assinatura confirmada! Seu plano será ativado em instantes.");
      navigate({ to: "/dashboard", search: {}, replace: true });
    }
  }, [checkoutStatus, navigate]);
  const { data: restaurant, isLoading: restaurantLoading, isError: restaurantError } = useRestaurant();
  const { data: orders } = useOrders(restaurant?.id);
  const { data: waiterCalls = [] } = useWaiterCalls(restaurant?.id);
  const resolveCall = useResolveWaiterCall(restaurant?.id);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const pendingCalls = waiterCalls.filter((c) => !c.resolved);
  const billCalls = pendingCalls.filter((c) => (c as any).kind === "bill");
  const regularCalls = pendingCalls.filter((c) => (c as any).kind !== "bill");
  const currency = restaurant?.currency ?? "BRL";
  const { data: trial } = useTrialStatus();
  const trialExpired = isTrialExpired(trial);

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
    
    const ACTIVE_STATUSES = ["pending", "accepted", "preparing", "ready", "served"];
    const activeTables = new Set(
      validOrders
        .filter((o) => ACTIVE_STATUSES.includes(o.status))
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

    return { ordersCount: todayOrders.length, activeTables, topItem, topQty };
  }, [orders]);

  const recent = (orders ?? []).slice(0, 6);

  const name = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "por aí";
  const ctaTo = restaurant ? "/menu" : "/onboarding";
  const ctaLabel = restaurant ? "Gerenciar cardápio" : "Configurar restaurante";

  const hour = new Date().getHours();
  const greeting =
    hour < 5 ? "Boa madrugada" : hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  if (restaurantLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (restaurantError || !restaurant) {
    return <WelcomeRestaurantModal />;
  }

  const STATS = [
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
      {trialExpired ? (
        <TrialExpiredBlock />
      ) : (
        <>
          {trial && <TrialBanner info={trial} />}
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

      {billCalls.length > 0 && (
        <div className="rounded-2xl border-2 border-[oklch(0.78_0.18_84_/_0.7)] bg-gold-soft p-4 shadow-[0_0_40px_-10px_oklch(0.78_0.18_84_/_0.7)] animate-pulse animate-fade-up">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            <DollarSign className="h-4 w-4 animate-pulse" />
            {billCalls.length} {billCalls.length === 1 ? "mesa pedindo a conta" : "mesas pedindo a conta"}
          </div>
          <ul className="space-y-1.5">
            {billCalls.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-background/70 px-3 py-2 text-sm">
                <span>
                  <DollarSign className="mr-1 inline h-3.5 w-3.5 text-primary" />
                  <span className="font-medium">{c.table_label ?? "Balcão"}</span>
                  {c.customer_name && <span className="text-muted-foreground"> · {c.customer_name}</span>}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
                <button
                  onClick={() => resolveCall.mutate(c.id)}
                  className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  Conta entregue
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {regularCalls.length > 0 && (
        <div className="rounded-2xl border border-[oklch(0.78_0.13_84_/_0.4)] bg-gold-soft p-4 animate-fade-up">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <Bell className="h-4 w-4 animate-pulse" />
            {regularCalls.length} {regularCalls.length === 1 ? "chamada de garçom" : "chamadas de garçom"}
          </div>
          <ul className="space-y-1.5">
            {regularCalls.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-background/60 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{c.table_label ?? "Balcão"}</span>
                  {c.customer_name && <span className="text-muted-foreground"> · {c.customer_name}</span>}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
                <button
                  onClick={() => resolveCall.mutate(c.id)}
                  className="rounded-lg border border-border bg-background px-3 py-1 text-xs transition hover:border-primary/40"
                >
                  Atender
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}


      <div className="grid gap-4 stagger sm:grid-cols-3">
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
              <li key={o.id}>
                <button
                  onClick={() => setSelectedOrder(o)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg py-3 text-left transition hover:bg-background/60 px-2 -mx-2"
                >
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
                      {STATUS_LABELS[o.status]}
                    </span>
                    <span className="font-display text-base tracking-tight">
                      {formatPrice(Number(o.subtotal), currency)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={(v) => !v && setSelectedOrder(null)}>
        <DialogContent className="max-w-md border-border bg-surface">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl tracking-tight">
              {selectedOrder?.table_label ?? "Balcão"}
              {selectedOrder?.customer_name ? ` · ${selectedOrder.customer_name}` : ""}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {new Date(selectedOrder.created_at).toLocaleString("pt-BR")}
                </span>
                <span className="rounded-full bg-gold-soft px-2 py-0.5 uppercase tracking-wider text-primary">
                  {STATUS_LABELS[selectedOrder.status]}
                </span>
              </div>
              {(selectedOrder as any).created_by_name && (
                <div className="text-xs text-muted-foreground">
                  Lançado por:{" "}
                  <span className="font-medium text-foreground">
                    {(selectedOrder as any).created_by_name}
                  </span>
                </div>
              )}
              {(selectedOrder as any).delivered_by_name && (
                <div className="text-xs text-emerald-400/90">
                  Entregue por:{" "}
                  <span className="font-medium">
                    {(selectedOrder as any).delivered_by_name}
                  </span>
                  {(selectedOrder as any).delivered_at && (
                    <> às {new Date((selectedOrder as any).delivered_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</>
                  )}
                </div>
              )}
              <ul className="divide-y divide-border rounded-xl border border-border">
                {selectedOrder.order_items.map((it) => {
                  const mods = (it.modifiers_snapshot as unknown as { name: string }[]) ?? [];
                  return (
                    <li key={it.id} className="p-3">
                      <div className="flex justify-between gap-2 text-sm">
                        <span>
                          <span className="font-medium text-primary">{it.quantity}×</span>{" "}
                          {it.name_snapshot}
                        </span>
                        <span className="text-muted-foreground">
                          {formatPrice(Number(it.price_snapshot) * it.quantity, currency)}
                        </span>
                      </div>
                      {Array.isArray(mods) && mods.length > 0 && (
                        <ul className="mt-1 space-y-0.5 pl-3 text-[11px] text-muted-foreground">
                          {mods.map((m, i) => (
                            <li key={i}>· {m.name}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-display text-2xl tracking-tight">
                  {formatPrice(Number(selectedOrder.subtotal), currency)}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AdminTour />
        </>
      )}
    </div>

  );
}

