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
  onClose: () => void;
  onOrder: () => void;
  onBill: () => void;
}) {
  const minutes = oldest ? Math.max(0, Math.floor((Date.now() - Date.parse(oldest)) / 60000)) : 0;
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
                {count ? count + " pedido(s) neste atendimento" : "Livre · comece por aqui"}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Fechar atendimento da mesa"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-border"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {count > 0 && (
            <div className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface p-4">
              <strong>{formatPrice(total, currency)}</strong>
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock3 className="h-4 w-4" />
                {minutes} min desde o primeiro pedido
              </span>
            </div>
          )}
          {ready > 0 && (
            <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              {ready} pedido(s) pronto(s) para entregar
            </p>
          )}
          {requireCode ? (
            <div className="mt-4">
              <TableAccessCode tableId={tableId} staffToken={staffToken} autoLoad />
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-border p-3 text-sm text-muted-foreground">
              Pedidos sem código. Os horários do restaurante continuam valendo.
            </p>
          )}
          <div className="mt-5 grid gap-3">
            <button
              onClick={onOrder}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary p-3 font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              {count ? "Adicionar pedido" : "Iniciar pedido"}
            </button>
            <button
              onClick={onBill}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border p-3 text-sm"
            >
              <Receipt className="h-4 w-4" />
              {count ? "Conferir conta e encerrar" : "Liberar mesa / encerrar código"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
