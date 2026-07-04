import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { ArrowLeft, Bell, Loader2, CheckCircle2, Utensils, Receipt } from "lucide-react";
import { toast } from "sonner";
import { useStaffSession } from "@/features/staff/staff-session";
import {
  staffListOrders,
  staffListCalls,
  staffResolveCall,
  staffUpdateOrderStatus,
  staffArchiveOrders,
} from "@/features/staff/staff-rpc";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/staff/$slug/waiter")({
  component: StaffWaiter,
});

function StaffWaiter() {
  const { slug } = Route.useParams();
  const session = useStaffSession(slug);
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!session) navigate({ to: "/staff/$slug", params: { slug } });
  }, [session, navigate, slug]);

  const restaurantId = session?.restaurant_id;

  const ordersQ = useQuery({
    queryKey: ["staff-orders", session?.token],
    enabled: !!session?.token,
    queryFn: () => staffListOrders(session!.token),
    refetchInterval: 5000,
  });

  const callsQ = useQuery({
    queryKey: ["staff-calls", session?.token],
    enabled: !!session?.token,
    queryFn: () => staffListCalls(session!.token),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!session) return;
    const ch = supabase
      .channel(`staff-live-${session.token}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" },
        () => { qc.invalidateQueries({ queryKey: ["staff-orders", session.token] }); })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" },
        () => { qc.invalidateQueries({ queryKey: ["staff-orders", session.token] }); })
      .on("postgres_changes", { event: "*", schema: "public", table: "waiter_calls" },
        () => { qc.invalidateQueries({ queryKey: ["staff-calls", session.token] }); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session, qc]);


  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      staffUpdateOrderStatus(session!.token, id, status, session!.name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-orders", session?.token] }),
  });

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

  const orders = ordersQ.data ?? [];
  const calls = callsQ.data ?? [];

  const byTable = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const o of orders) {
      const key = (o.table_label ?? "Sem mesa").toString();
      const arr = map.get(key) ?? [];
      arr.push(o);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [orders]);

  if (!session) return null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link to="/staff/$slug" params={{ slug }} className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </Link>

      {calls.length > 0 && (
        <section className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
            <Bell className="h-4 w-4" /> {calls.length} chamado(s) em aberto
          </div>
          <ul className="mt-3 space-y-2">
            {calls.map((c: any) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg bg-background/40 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">
                    {c.kind === "bill" ? "Conta" : "Chamado"} · {c.table_label || "Sem mesa"}
                  </div>
                  {c.customer_name && <div className="text-xs text-muted-foreground">Por {c.customer_name}</div>}
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

      <h1 className="font-display text-xl tracking-tight">Mesas ativas</h1>
      {ordersQ.isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : byTable.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface/40 px-6 py-12 text-center text-sm text-muted-foreground">
          Nenhuma mesa com pedido no momento.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {byTable.map(([label, list]) => (
            <TableCard
              key={label}
              label={label}
              orders={list}
              onAdvance={(id, status) => updateStatus.mutate({ id, status })}
              onClose={(ids) => archive.mutate(ids)}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function TableCard({
  label,
  orders,
  onAdvance,
  onClose,
}: {
  label: string;
  orders: any[];
  onAdvance: (id: string, status: string) => void;
  onClose: (ids: string[]) => void;
}) {
  const sortedOrders = [...orders].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const total = sortedOrders.reduce(
    (sum, o) => sum + Number(o.total ?? o.subtotal ?? 0),
    0,
  );
  const fmt = (n: number) =>
    `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const statusMap: Record<string, { label: string; cls: string }> = {
    pending: { label: "Aguardando", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
    accepted: { label: "Aceito", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
    preparing: { label: "Preparando", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
    ready: { label: "Pronto", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
    served: { label: "Entregue", cls: "bg-muted text-muted-foreground border-border" },
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display text-lg">{label}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {sortedOrders.length} {sortedOrders.length === 1 ? "pedido" : "pedidos"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
          <div className="text-sm font-semibold text-primary">{fmt(total)}</div>
        </div>
      </div>

      <ul className="mt-3 space-y-3">
        {sortedOrders.map((o, idx) => {
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
            <li key={o.id} className="rounded-xl border border-border bg-background/40 p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
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
                        {fmt(Number(it.price ?? 0) * Number(it.quantity ?? 0))}
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
                <span className="font-medium">{fmt(orderSubtotal)}</span>
              </div>

              {o.status !== "served" && (
                <button
                  onClick={() => onAdvance(o.id, "served")}
                  className="mt-2 w-full rounded-md border border-border px-2 py-1.5 text-[11px] hover:bg-surface"
                >
                  <CheckCircle2 className="mr-1 inline h-3 w-3" /> Marcar como entregue
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <button
        onClick={() => {
          if (confirm(`Finalizar e liberar ${label}?`)) onClose(orders.map((o) => o.id));
        }}
        className="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
      >
        <Receipt className="mr-1 inline h-3.5 w-3.5" /> Finalizar e Liberar
      </button>
    </div>
  );
}
