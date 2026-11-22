import { useState } from "react";
import { Copy, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
const schema = z
  .object({ code: z.string().regex(/^[0-9]{4}$/), expires_at: z.string() })
  .nullable();
export function TableAccessCode({
  tableId,
  staffToken,
  autoLoad = false,
}: {
  tableId: string;
  staffToken?: string;
  autoLoad?: boolean;
}) {
  const [active, setActive] = useState(autoLoad);
  const qc = useQueryClient();
  const queryKey = ["table-access-code", tableId, staffToken];
  const current = useQuery({
    queryKey,
    enabled: active,
    staleTime: 30000,
    refetchInterval: 60000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("table_order_code", {
        p_table_id: tableId,
        p_staff_token: staffToken ?? null,
        p_rotate: false,
      });
      if (error) throw error;
      return schema.parse(data);
    },
  });
  const code =
    current.isError || (current.data && Date.parse(current.data.expires_at) <= Date.now())
      ? null
      : current.data;
  const request = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("table_order_code", {
        p_table_id: tableId,
        p_staff_token: staffToken ?? null,
        p_rotate: true,
      });
      if (error) throw error;
      return schema.parse(data);
    },
    onSuccess: (value) => {
      qc.setQueryData(queryKey, value);
    },
    onError: () =>
      toast.error("Não foi possível obter o código. Confira a atualização SQL e seu acesso."),
  });
  const busy = request.isPending || current.isFetching;
  if (!active)
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="mt-3 min-h-11 w-full rounded-xl border border-border px-3 text-sm text-muted-foreground"
      >
        Consultar código da mesa
      </button>
    );
  return (
    <div
      className="mt-2 rounded-2xl border border-border bg-background/50 p-3.5"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <KeyRound className="h-3.5 w-3.5" /> Código da mesa
        </span>
        <span
          title={
            code ? "Válido até " + new Date(code.expires_at).toLocaleString("pt-BR") : undefined
          }
          className={
            code
              ? "rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
              : "text-[10px] text-muted-foreground"
          }
        >
          {current.isError
            ? "Indisponível"
            : current.isPending
              ? "Consultando…"
              : code
                ? "Ativo"
                : "Não gerado"}
        </span>
      </div>
      <div
        role="status"
        aria-label={code ? "Código da mesa: " + code.code.split("").join(" ") : "Sem código ativo"}
        className="flex justify-center gap-2 py-2"
      >
        {(code?.code.split("") ?? ["–", "–", "–", "–"]).map((digit, index) => (
          <span
            key={index}
            aria-hidden="true"
            className={
              "flex h-11 w-10 items-center justify-center rounded-lg border font-mono text-2xl font-semibold tabular-nums " +
              (code
                ? "border-primary/20 bg-primary/5 text-primary"
                : "border-border bg-surface text-muted-foreground/35")
            }
          >
            {digit}
          </span>
        ))}
      </div>
      {current.isError ? (
        <button
          type="button"
          onClick={() => void current.refetch()}
          disabled={busy}
          className="mt-3 min-h-10 w-full rounded-lg border border-border text-xs text-muted-foreground disabled:opacity-50"
        >
          Tentar novamente
        </button>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!code) {
                request.mutate();
                return;
              }
              void current
                .refetch()
                .then((result) => {
                  if (result.isError || !result.data) throw new Error("Código expirado");
                  return navigator.clipboard.writeText(result.data.code);
                })
                .then(() => toast.success("Código copiado"))
                .catch(() => toast.error("Confira o código atual antes de compartilhar"));
            }}
            className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {request.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
            ) : code ? (
              <Copy className="h-3.5 w-3.5" />
            ) : (
              <KeyRound className="h-3.5 w-3.5" />
            )}
            {request.isPending ? "Gerando…" : code ? "Copiar" : "Gerar código"}
          </button>
          {code && (
            <button
              type="button"
              disabled={busy}
              onClick={() => request.mutate()}
              aria-label="Trocar código da mesa"
              title="Trocar código — invalida o anterior"
              className="flex min-h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      {code && (
        <p className="mt-2.5 text-center text-[10px] text-muted-foreground">
          Encerra ao liberar a mesa.
        </p>
      )}
    </div>
  );
}
