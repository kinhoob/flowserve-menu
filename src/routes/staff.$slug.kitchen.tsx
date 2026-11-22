import { toast } from "sonner";
import { NewOrderAlarm } from "@/features/orders/new-order-alarm";
import { ConnectionNotice } from "@/features/orders/connection-notice";
import type { StaffOrder } from "@/features/staff/staff-rpc";
import { staffListOrders, staffUpdateOrderStatus } from "@/features/staff/staff-rpc";
import { useStaffSession } from "@/features/staff/staff-session";
import { supabase } from "@/integrations/supabase/client";
import { recordRealtimeEvent } from "@/lib/realtime-telemetry";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, ChefHat, Loader2 } from "lucide-react";
import { useEffect, useMemo } from "react";

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
    refetchInterval: 5000,
    queryFn: () => staffListOrders(session!.token),
  });

  useEffect(() => {
    if (!session) return;
    const ch = supabase
      .channel(`staff-kds-${session.token}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        recordRealtimeEvent("kds", payload);
        qc.invalidateQueries({ queryKey: ["staff-orders", session.token] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, (payload) => {
        recordRealtimeEvent("kds", payload);
        qc.invalidateQueries({ queryKey: ["staff-orders", session.token] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [session, qc]);

  const updateStatus = useMutation({
    networkMode: "always",
    mutationFn: async ({
      id,
      status,
      expected,
    }: {
      id: string;
      status: string;
      expected: string;
    }) => staffUpdateOrderStatus(session!.token, id, status, session!.name, expected),
    onError: (error: Error) => {
      void qc.invalidateQueries({ queryKey: ["staff-orders", session?.token] });
      toast.error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-orders", session?.token] }),
  });

  const grouped = useMemo(() => {
    const map: Record<string, StaffOrder[]> = { pending: [], preparing: [], ready: [] };
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
      <Link
        to="/staff/$slug"
        params={{ slug }}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </Link>
      <h1 className="mb-6 flex items-center gap-2 font-display text-xl tracking-tight">
        <ChefHat className="h-5 w-5 text-primary" /> KDS — Cozinha
      </h1>

      <ConnectionNotice />
      <NewOrderAlarm orders={ordersQ.data ?? []} />
      {ordersQ.isError && (
        <p role="alert" className="rounded-xl border border-destructive p-3 text-sm">
          Não foi possível atualizar os pedidos.{" "}
          <button className="underline" onClick={() => void ordersQ.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      {ordersQ.isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <section key={col.key} className="rounded-2xl border border-border bg-surface p-3">
              <header className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {col.label}
                </h2>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs">
                  {grouped[col.key].length}
                </span>
              </header>
              <div className="space-y-2">
                {grouped[col.key].length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    Vazio
                  </div>
                ) : (
                  grouped[col.key].map((o) => (
                    <article
                      key={o.id}
                      className={cn(
                        "rounded-xl border border-border bg-background p-3",
                        col.key === "ready" && "border-emerald-500/40",
                        col.key === "pending" && "border-amber-500/40",
                      )}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold">{o.table_label || "Sem mesa"}</span>
                        <span className="text-muted-foreground">{o.customer_name || ""}</span>
                      </div>
                      <ul className="mt-2 space-y-0.5 text-sm">
                        {(o.items ?? []).map((it) => (
                          <li key={it.id} className="flex flex-col gap-1">
                            <span>
                              {it.quantity}× {it.name}
                            </span>
                            {it.modifiers?.length > 0 && (
                              <p className="text-xs font-medium text-primary">
                                Adicionais: {it.modifiers.map((m) => m.name).join(" · ")}
                              </p>
                            )}
                            {it.notes && (
                              <p className="rounded-lg border border-primary/30 p-2 text-xs font-semibold">
                                Obs.: {it.notes}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                      {col.next &&
                        (col.next !== "served" ||
                          session.role === "both" ||
                          session.role === "waiter") && (
                          <button
                            onClick={() =>
                              updateStatus.mutate({
                                id: o.id,
                                status: col.next!,
                                expected: o.status,
                              })
                            }
                            disabled={updateStatus.isPending}
                            className="mt-3 w-full rounded-lg bg-primary px-3 min-h-11 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            <CheckCircle2 className="mr-1 inline h-3 w-3" /> Marcar como{" "}
                            {col.next === "preparing"
                              ? "preparando"
                              : col.next === "ready"
                                ? "pronto"
                                : "entregue"}
                          </button>
                        )}
                    </article>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
