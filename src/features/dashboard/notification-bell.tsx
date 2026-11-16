import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, ArrowLeft, ChevronRight } from "lucide-react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/use-auth";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { useWaiterCalls } from "@/features/waiter/waiter-queries";
const noticesSchema = z.array(
  z.object({
    id: z.string(),
    period_start: z.string(),
    period_end: z.string(),
    read_at: z.string().nullable(),
    timezone: z.string(),
  }),
);
const summarySchema = z.object({
  currency: z.string(),
  timezone: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  revenue: z.number(),
  delivered: z.number(),
  pending: z.number(),
  cancelled: z.number(),
});
export function NotificationBell() {
  const { user } = useAuth();
  const { data: restaurant } = useRestaurant();
  const { data: calls = [] } = useWaiterCalls(restaurant?.id);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const qc = useQueryClient();
  useEffect(() => {
    if (!restaurant?.id) return;
    const channel = supabase
      .channel(`closing-notices-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_notifications",
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["closing-notifications"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [restaurant?.id, qc]);
  const notices = useQuery({
    queryKey: ["closing-notifications", user?.id],
    enabled: !!user,
    refetchInterval: 30000,
    retry: false,
    queryFn: async () => {
      const synced = await supabase.rpc("sync_closing_notifications");
      if (synced.error) throw synced.error;
      const { data, error } = await supabase.rpc("list_closing_notifications");
      if (error) throw error;
      return noticesSchema.parse(data);
    },
  });
  const summary = useQuery({
    queryKey: ["closing-summary", selected],
    enabled: !!selected && open,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("closing_summary", {
        p_notification_id: selected!,
      });
      if (error) throw error;
      void qc.invalidateQueries({ queryKey: ["closing-notifications"] });
      return summarySchema.parse(data);
    },
  });
  const pendingCalls = calls.filter((c) => !c.resolved).length;
  const unread = (notices.data ?? []).filter((n) => !n.read_at).length + pendingCalls;
  const date = (s: string, tz: string) =>
    new Date(s).toLocaleString("pt-BR", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  const report = summary.data;
  return (
    <>
      <button
        id="notification-bell"
        aria-label={`Notificações${unread ? `, ${unread} novas` : ""}`}
        onClick={() => {
          setSelected(null);
          setOpen(true);
        }}
        className="relative rounded-xl border border-border bg-surface p-2.5 text-muted-foreground transition hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-primary px-1 text-center text-[10px] leading-5 text-primary-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{selected ? "Resumo do fechamento" : "Suas notificações"}</DialogTitle>
            <DialogDescription>
              {selected
                ? "Valores dos pedidos deste turno, atualizados ao consultar."
                : "Fechamentos do bar e chamados do salão."}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <>
              <button
                onClick={() => setSelected(null)}
                className="flex items-center gap-2 text-sm text-primary"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </button>
              {summary.isPending ? (
                <p role="status">Carregando resumo…</p>
              ) : summary.isError ? (
                <button onClick={() => void summary.refetch()}>
                  Não foi possível carregar. Tentar novamente
                </button>
              ) : (
                report && (
                  <div className="space-y-5">
                    <p className="text-sm text-muted-foreground">
                      {date(report.period_start, report.timezone)} até{" "}
                      {date(report.period_end, report.timezone)} · {report.timezone}
                    </p>
                    <div className="rounded-2xl border border-primary/30 bg-gold-soft p-6">
                      <p className="text-xs uppercase tracking-widest">
                        Receita de pedidos entregues
                      </p>
                      <p className="mt-2 font-display text-4xl">
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: report.currency,
                        }).format(report.revenue)}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Inclui taxas registradas. Não confirma recebimento de pagamento.
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        ["Entregues", report.delivered],
                        ["Em aberto", report.pending],
                        ["Cancelados", report.cancelled],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-border p-3">
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="mt-1 text-2xl">{value}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      O período vai do fechamento anterior do bar até este fechamento, incluindo as
                      vendas da cozinha. Pedidos são agrupados pela hora em que foram feitos.
                      Cancelados e ainda não entregues ficam fora da receita. Entregas posteriores
                      atualizam o resumo.
                    </p>
                    <Link
                      to="/analytics"
                      onClick={() => setOpen(false)}
                      className="inline-flex rounded-xl bg-primary px-4 py-3 text-sm text-primary-foreground"
                    >
                      Abrir análises completas
                    </Link>
                  </div>
                )
              )}
            </>
          ) : (
            <div className="space-y-3">
              {pendingCalls > 0 && (
                <Link
                  to="/waiter"
                  onClick={() => setOpen(false)}
                  className="block rounded-xl border border-border p-4 text-sm"
                >
                  {pendingCalls} chamado(s) aguardando atendimento →
                </Link>
              )}
              {notices.isError ? (
                <p className="rounded-xl border border-border p-4 text-sm">
                  Os avisos de fechamento precisam da atualização SQL. Se ela já foi aplicada,{" "}
                  <button className="underline" onClick={() => void notices.refetch()}>
                    tente novamente
                  </button>
                  .
                </p>
              ) : notices.isPending ? (
                <p>Buscando avisos…</p>
              ) : (notices.data?.length ?? 0) === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                  Tudo em dia. Salve a agenda semanal em Configurações → Operação. No fechamento do
                  bar, o resumo aparecerá aqui automaticamente.
                </p>
              ) : (
                notices.data?.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setSelected(n.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border p-4 text-left transition hover:bg-muted/30"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-muted" : "bg-primary"}`}
                    />
                    <span className="flex-1">
                      <strong className="block text-sm">
                        Bar encerrado · {date(n.period_end, n.timezone)}
                      </strong>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Toque aqui para ver a receita gerada neste turno.
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ))
              )}
              <p className="pt-2 text-xs text-muted-foreground">
                Avisos dentro do Flux. Com o aplicativo fechado, ficam guardados para o próximo
                acesso.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
