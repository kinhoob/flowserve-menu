import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
export function CancelOrderDialog({
  open,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !pending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar este pedido?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Confirme com a equipe antes de cancelar. O pedido sairá da operação e será excluído dos
          valores de vendas.
        </p>
        <label className="text-sm">
          Motivo do cancelamento
          <textarea
            rows={3}
            maxLength={280}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input-field mt-2"
            placeholder="Ex.: cliente desistiu ou ingrediente indisponível"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            disabled={pending}
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-sm"
          >
            Manter pedido
          </button>
          <button
            disabled={pending || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            className="rounded-xl bg-destructive px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {pending ? "Cancelando…" : "Confirmar cancelamento"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
