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
  const total = orders.reduce((sum, o) => sum + Number(o.total_cents ?? 0), 0) / 100;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="font-display text-lg">{label}</div>
        <div className="text-sm font-semibold text-primary">R$ {total.toFixed(2)}</div>
      </div>
      <ul className="mt-3 space-y-2">
        {orders.map((o) => (
          <li key={o.id} className="rounded-lg bg-background/40 p-2 text-xs">
            <div className="flex items-center justify-between">
              <span className={cn(
                "rounded px-1.5 py-0.5 text-[10px] uppercase",
                o.status === "pending" && "bg-amber-500/20 text-amber-200",
                o.status === "preparing" && "bg-blue-500/20 text-blue-200",
                o.status === "ready" && "bg-emerald-500/20 text-emerald-200",
                o.status === "served" && "bg-muted text-muted-foreground",
              )}>{o.status}</span>
              {o.customer_name && <span className="text-muted-foreground">{o.customer_name}</span>}
            </div>
            <ul className="mt-1.5 space-y-0.5 text-foreground/80">
              {(o.items ?? []).map((it: any) => (
                <li key={it.id} className="flex justify-between">
                  <span>{it.quantity}× {it.name}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-1">
              {o.status !== "served" && (
                <button
                  onClick={() => onAdvance(o.id, "served")}
                  className="flex-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-surface"
                >
                  <CheckCircle2 className="mr-1 inline h-3 w-3" /> Entregar
                </button>
              )}
            </div>
          </li>
        ))}
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
