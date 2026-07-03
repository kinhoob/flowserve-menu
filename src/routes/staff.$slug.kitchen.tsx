import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { ArrowLeft, Loader2, ChefHat, CheckCircle2 } from "lucide-react";
import { useStaffSession } from "@/features/staff/staff-session";
import { staffListOrders, staffUpdateOrderStatus } from "@/features/staff/staff-rpc";
import { supabase } from "@/integrations/supabase/client";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/staff/$slug/kitchen")({
  component: StaffKitchen,
});

const COLUMNS: { key: string; label: string; next?: string }[] = [
  { key: "pending", label: "Novos", next: "preparing" },
  { key: "preparing", label: "Preparando", next: "ready" },
  { key: "ready", label: "Prontos", next: "served" },
];

function StaffKitchen() {
  const { slug } = Route.useParams();
  const session = useStaffSession(slug);
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!session) navigate({ to: "/staff/$slug", params: { slug } });
  }, [session, navigate, slug]);

  const ordersQ = useQuery({
    queryKey: ["staff-orders", session?.token],
    enabled: !!session?.token,
    queryFn: () => staffListOrders(session!.token),
    refetchInterval: 4000,
  });

  useEffect(() => {
    if (!session) return;
    const ch = supabase
      .channel(`staff-kds-${session.token}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" },
        () => qc.invalidateQueries({ queryKey: ["staff-orders", session.token] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" },
        () => qc.invalidateQueries({ queryKey: ["staff-orders", session.token] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session, qc]);


  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      staffUpdateOrderStatus(session!.token, id, status, session!.name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-orders", session?.token] }),
  });

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = { pending: [], preparing: [], ready: [] };
    for (const o of ordersQ.data ?? []) {
      // Treat 'accepted' (recém-confirmado) as 'pending' na coluna Novos
      const col = o.status === "accepted" ? "pending" : o.status;
      if (col in map) map[col].push(o);
    }
    return map;
  }, [ordersQ.data]);

  if (!session) return null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <Link to="/staff/$slug" params={{ slug }} className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </Link>
      <h1 className="mb-6 flex items-center gap-2 font-display text-xl tracking-tight">
        <ChefHat className="h-5 w-5 text-primary" /> KDS — Cozinha
      </h1>

      {ordersQ.isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <section key={col.key} className="rounded-2xl border border-border bg-surface p-3">
              <header className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{col.label}</h2>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs">{grouped[col.key].length}</span>
              </header>
              <div className="space-y-2">
                {grouped[col.key].length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">Vazio</div>
                ) : grouped[col.key].map((o: any) => (
                  <article key={o.id} className={cn(
                    "rounded-xl border border-border bg-background p-3",
                    col.key === "ready" && "border-emerald-500/40",
                    col.key === "pending" && "border-amber-500/40",
                  )}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold">{o.table_label || "Sem mesa"}</span>
                      <span className="text-muted-foreground">{o.customer_name || ""}</span>
                    </div>
                    <ul className="mt-2 space-y-0.5 text-sm">
                      {(o.items ?? []).map((it: any) => (
                        <li key={it.id} className="flex justify-between">
                          <span>{it.quantity}× {it.name}</span>
                        </li>
                      ))}
                    </ul>
                    {col.next && (
                      <button
                        onClick={() => updateStatus.mutate({ id: o.id, status: col.next! })}
                        disabled={updateStatus.isPending}
                        className="mt-3 w-full rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        <CheckCircle2 className="mr-1 inline h-3 w-3" /> Marcar como {col.next === "preparing" ? "preparando" : col.next === "ready" ? "pronto" : "entregue"}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
