import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { ChefHat, CheckCircle2, Bell, DollarSign } from "lucide-react";
import type { Order } from "@/features/orders/order-queries";
import type { WaiterCall } from "@/features/waiter/waiter-queries";
export function OperationalOverview({
  orders,
  calls,
  kitchen,
  resolve,
  pending,
}: {
  orders: Order[];
  calls: WaiterCall[];
  kitchen: boolean;
  resolve: (id: string) => void;
  pending: boolean;
}) {
  const [view, setView] = useState<"calls" | "bill" | null>(null);
  const regular = calls.filter((c) => !c.resolved && c.kind !== "bill"),
    bills = calls.filter((c) => !c.resolved && c.kind === "bill");
  const selected = view === "bill" ? bills : regular;
  return (
    <>
      <section aria-label="Resumo operacional" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kitchen && (
          <>
            <Link to="/kitchen" search={{ status: "pending" }} className="flux-panel p-4">
              <ChefHat className="mb-3 h-4 w-4 text-primary" />
              <p className="text-2xl font-semibold">
                {orders.filter((o) => !o.archived && o.status === "pending").length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Novos pedidos →</p>
            </Link>
            <Link to="/kitchen" search={{ status: "ready" }} className="flux-panel p-4">
              <CheckCircle2 className="mb-3 h-4 w-4 text-primary" />
              <p className="text-2xl font-semibold">
                {orders.filter((o) => !o.archived && o.status === "ready").length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Prontos para entregar →</p>
            </Link>
          </>
        )}
        {[
          { key: "calls" as const, title: "Chamados da equipe", count: regular.length, icon: Bell },
          {
            key: "bill" as const,
            title: "Contas solicitadas",
            count: bills.length,
            icon: DollarSign,
          },
        ].map(({ key, title, count, icon: Icon }) => (
          <button key={key} onClick={() => setView(key)} className="flux-panel p-4 text-left">
            <Icon className="mb-3 h-4 w-4 text-primary" />
            <p className="text-2xl font-semibold">{count}</p>
            <p className="mt-1 text-xs text-muted-foreground">{title} →</p>
          </button>
        ))}
      </section>
      <Dialog open={!!view} onOpenChange={(open) => !open && setView(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto border-border bg-surface">
          <DialogHeader>
            <DialogTitle>
              {view === "bill" ? "Contas solicitadas" : "Chamados da equipe"}
            </DialogTitle>
          </DialogHeader>
          {selected.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Nenhuma solicitação pendente.</p>
          ) : (
            <ul className="space-y-3">
              {selected.map((call) => (
                <li
                  key={call.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                >
                  <span className="text-sm">{call.table_label ?? "Balcão"}</span>
                  <button
                    disabled={pending}
                    onClick={() => resolve(call.id)}
                    className="min-h-10 rounded-lg bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50"
                  >
                    {view === "bill" ? "Conta entregue" : "Atender"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
