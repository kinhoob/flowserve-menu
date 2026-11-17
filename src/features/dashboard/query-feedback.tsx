export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Carregando o painel" className="mx-auto max-w-7xl space-y-6">
      <div className="h-8 w-56 rounded-lg bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-32 rounded-2xl border border-border bg-surface" />
        ))}
      </div>
      <div className="h-64 rounded-2xl border border-border bg-surface" />
      <span className="sr-only">Carregando dados…</span>
    </div>
  );
}
export function QueryError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
    >
      <p>{message}</p>
      <button
        onClick={retry}
        className="mt-3 min-h-10 rounded-lg border border-border px-3 text-xs font-medium"
      >
        Tentar novamente
      </button>
    </div>
  );
}
