import { Link } from "@tanstack/react-router";
import { useOrders } from "@/features/orders/order-queries";
import { SyncStatus } from "@/features/orders/sync-status";
export function LiveOperationSummary({ restaurantId }: { restaurantId: string | undefined }) {
  const q = useOrders(restaurantId);
  const active = (q.data ?? []).filter(
    (o) => !o.archived && !["served", "cancelled"].includes(o.status),
  );
  const late = active.filter((o) => Date.now() - Date.parse(o.created_at) > 20 * 60000);
  return (
    <section
      aria-label="Operação atual"
      className="rounded-2xl border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Operação agora</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Todos os setores · não muda com os filtros do relatório. Referência de atraso: 20
            minutos.
          </p>
        </div>
        <Link
          to="/kitchen"
          search={{}}
          className="min-h-11 rounded-xl border border-border px-4 py-3 text-sm"
        >
          Abrir pedidos →
        </Link>
      </div>
      <p className="my-4 text-xl font-semibold">
        {q.isPending
          ? "Carregando…"
          : q.isError
            ? "Não foi possível consultar a fila"
            : active.length + " em andamento · " + late.length + " acima de 20 min"}
      </p>
      <SyncStatus
        updatedAt={q.dataUpdatedAt}
        busy={q.isFetching}
        error={q.isError}
        connection={q.realtime}
        retry={() => void q.refetch()}
      />
    </section>
  );
}
