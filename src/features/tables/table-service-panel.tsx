import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Plus, Receipt, Clock3 } from "lucide-react";
import { TableAccessCode } from "./table-access-code";
import { formatPrice } from "@/lib/format";
export function TableServicePanel({
  tableId,
  label,
  staffToken,
  requireCode = true,
  count,
  ready,
  total,
  currency,
  oldest,
  serviceId,
  serviceStartedAt,
  serviceState,
  allowNew = true,
  onClose,
  onOrder,
  onBill,
}: {
  tableId: string;
  label: string;
  staffToken?: string;
  requireCode?: boolean;
  count: number;
  ready: number;
  total: number;
  currency: string;
  oldest?: string;
  serviceId?: string | null;
  serviceStartedAt?: string | null;
  serviceState?: string;
  allowNew?: boolean;
  onClose: () => void;
  onOrder: () => void;
  onBill: () => void;
}) {
  const qc = useQueryClient();
  const [started, setStarted] = useState(false);
  const [history, setHistory] = useState(false);
  const active = !!serviceId || started || count > 0;
  const start = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("start_table_service", {
        p_table_id: tableId,
        p_staff_token: staffToken ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setStarted(true);
      void qc.invalidateQueries({ queryKey: ["venue_tables"] });
      void qc.invalidateQueries({ queryKey: ["staff-tables"] });
      void qc.invalidateQueries({ queryKey: ["table-events"] });
      toast.success("Atendimento iniciado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const events = useQuery({
    queryKey: ["table-events", tableId, staffToken],
    enabled: history,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_table_events", {
        p_table_id: tableId,
        p_staff_token: staffToken ?? null,
      });
      if (error) throw error;
      return z
        .array(
          z.object({
            occurred_at: z.string(),
            event: z.string(),
            actor_name: z.string(),
            details: z.record(z.string(), z.unknown()),
          }),
        )
        .parse(data);
    },
  });
  const labels: Record<string, string> = {
    service_started: "Atendimento iniciado",
    code_issued: "Código emitido ou trocado",
    service_closed: "Mesa liberada",
    service_resumed: "Atendimento retomado",
    bill_requested: "Conta solicitada",
    order_created: "Pedido recebido",
    order_closed: "Pedido encerrado",
    order_status: "Etapa alterada",
    order_adjusted: "Valores ou responsável ajustados",
  };
  const statusLabels: Record<string, string> = {
    pending: "Novo",
    accepted: "Aceito",
    preparing: "Em preparo",
    ready: "Pronto",
    served: "Entregue",
    cancelled: "Cancelado",
  };
  const since = serviceStartedAt ?? oldest;
  const minutes = since ? Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 60000)) : 0;
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/65" />
        <Dialog.Content className="fixed bottom-0 left-1/2 z-50 max-h-[90dvh] w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-3xl border border-border bg-background p-5 shadow-xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-2xl font-semibold">{label}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                {serviceState === "bill_requested"
                  ? "Conta solicitada"
                  : active
                    ? "Em atendimento · " + count + " pedido(s)"
                    : "Livre · inicie o atendimento"}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Fechar atendimento da mesa"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-border"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {active && (
            <div className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface p-4">
              <strong>{formatPrice(total, currency)}</strong>
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock3 className="h-4 w-4" />
                {minutes} min de atendimento
              </span>
            </div>
          )}
          {ready > 0 && (
            <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              {ready} pedido(s) pronto(s) para entregar
            </p>
          )}
          {!active && (
            <button
              disabled={!allowNew || start.isPending}
              onClick={() => start.mutate()}
              className="mt-4 min-h-12 w-full rounded-xl bg-primary p-3 font-semibold text-primary-foreground disabled:opacity-50"
            >
              {start.isPending
                ? "Iniciando…"
                : allowNew
                  ? "Iniciar atendimento"
                  : "Escolha um plano para iniciar"}
            </button>
          )}
          {active &&
            (requireCode ? (
              <div className="mt-4">
                <TableAccessCode tableId={tableId} staffToken={staffToken} autoLoad />
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-border p-3 text-sm text-muted-foreground">
                Pedidos sem código. Os horários do restaurante continuam valendo.
              </p>
            ))}
          <div className="mt-5 grid gap-3">
            <button
              onClick={onOrder}
              disabled={!active || !allowNew}
              className="flex min-h-12 disabled:opacity-50 items-center justify-center gap-2 rounded-xl bg-primary p-3 font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              {count ? "Adicionar pedido" : "Iniciar pedido"}
            </button>
            <button
              onClick={onBill}
              disabled={!active}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border p-3 text-sm"
            >
              <Receipt className="h-4 w-4" />
              {count ? "Conferir conta e encerrar" : "Liberar mesa / encerrar código"}
            </button>
          </div>
          <details
            className="mt-5 border-t border-border pt-4"
            onToggle={(e) => setHistory(e.currentTarget.open)}
          >
            <summary className="min-h-10 cursor-pointer text-sm font-medium">
              Últimas ações da mesa
            </summary>
            {events.isPending ? (
              <p className="py-3 text-sm">Carregando…</p>
            ) : events.isError ? (
              <button onClick={() => void events.refetch()} className="min-h-11 text-sm underline">
                Tentar novamente
              </button>
            ) : (
              <ol className="mt-2 space-y-3 text-sm">
                {events.data?.map((event, index) => (
                  <li key={index} className="border-l border-border pl-3">
                    <p className="font-medium">
                      {labels[event.event] ?? event.event}
                      {typeof event.details.status === "string"
                        ? " · " + (statusLabels[event.details.status] ?? event.details.status)
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.actor_name} · {new Date(event.occurred_at).toLocaleString("pt-BR")}
                    </p>
                    {typeof event.details.reason === "string" && (
                      <p className="mt-1">{event.details.reason}</p>
                    )}
                  </li>
                ))}
                {!events.data?.length && (
                  <li>Sem ações registradas desde a ativação do histórico.</li>
                )}
              </ol>
            )}
          </details>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
