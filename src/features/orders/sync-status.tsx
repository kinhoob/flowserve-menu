export function SyncStatus({
  updatedAt,
  busy,
  error,
  retry,
}: {
  updatedAt: number;
  busy?: boolean;
  error?: boolean;
  retry: () => void;
}) {
  return (
    <div
      role="status"
      className={
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm " +
        (error ? "border-amber-400/40 bg-amber-400/5" : "border-border bg-surface")
      }
    >
      <span>
        {error
          ? "Falha ao sincronizar. Os dados podem estar desatualizados."
          : busy
            ? "Conferindo os dados…"
            : updatedAt
              ? "Atualizado às " + new Date(updatedAt).toLocaleTimeString("pt-BR")
              : "Aguardando dados do restaurante…"}
      </span>
      <button
        onClick={retry}
        disabled={busy}
        className="min-h-10 rounded-lg border border-border px-3 text-sm disabled:opacity-50"
      >
        {error ? "Tentar novamente" : "Atualizar"}
      </button>
    </div>
  );
}
