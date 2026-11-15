import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPrice } from "@/lib/format";
import { Minus, Plus, Users } from "lucide-react";
import { useState } from "react";
import { billTotalCents, splitBillCents } from "./split-bill";
export function SplitBillDialog({ total, currency = "BRL" }: { total: number; currency?: string }) {
  const [open, setOpen] = useState(false),
    [people, setPeople] = useState(2);
  let cents = 0;
  let valid = true;
  try {
    cents = billTotalCents(total);
  } catch {
    valid = false;
  }
  const shares = valid ? splitBillCents(cents, people) : [];
  return (
    <>
      <button
        disabled={!valid}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <Users className="h-4 w-4" />
        Simular divisão da conta
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-border bg-surface sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Uma conta. Sem complicação.</DialogTitle>
            <DialogDescription>
              Divisão igual para combinar com a mesa. Esta calculadora não registra nem realiza
              pagamentos.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-border bg-background/50 p-5 text-center">
            <p className="flux-eyebrow text-muted-foreground">Total a dividir</p>
            <p className="mt-2 font-display text-4xl">{formatPrice(total, currency)}</p>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-muted-foreground">Quantas pessoas?</span>
            <div className="flex items-center gap-4">
              <button
                aria-label="Diminuir número de pessoas"
                disabled={people <= 1}
                onClick={() => setPeople((value) => value - 1)}
                className="rounded-lg border border-border p-2 disabled:opacity-30"
              >
                <Minus className="h-4 w-4" />
              </button>
              <output className="w-5 text-center text-lg font-medium" aria-live="polite">
                {people}
              </output>
              <button
                aria-label="Aumentar número de pessoas"
                disabled={people >= 20}
                onClick={() => setPeople((value) => value + 1)}
                className="rounded-lg border border-border p-2 disabled:opacity-30"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div
            className="max-h-52 space-y-2 overflow-y-auto rounded-2xl bg-primary/5 p-4"
            aria-live="polite"
          >
            {shares.map((share, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pessoa {index + 1}</span>
                <span className="font-semibold text-primary">
                  {formatPrice(share / 100, currency)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Os centavos são distribuídos para que a soma seja exatamente o total.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
