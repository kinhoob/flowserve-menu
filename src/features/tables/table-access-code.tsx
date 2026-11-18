import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
const schema = z
  .object({ code: z.string().regex(/^[0-9]{4}$/), expires_at: z.string() })
  .nullable();
export function TableAccessCode({ tableId, staffToken }: { tableId: string; staffToken?: string }) {
  const [revealed, setRevealed] = useState(true);
  const qc = useQueryClient();
  const queryKey = ["table-access-code", tableId, staffToken];
  const current = useQuery({
    queryKey,
    enabled: revealed,
    refetchInterval: 15000,
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
      setRevealed(true);
    },
    onError: () =>
      toast.error("Não foi possível obter o código. Confira a atualização SQL e seu acesso."),
  });
  return (
    <div
      className="mt-3 rounded-xl border border-border bg-background/60 p-3 text-xs"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-2 text-muted-foreground">Código para pedidos nesta mesa</p>
      {current.isError && (
        <p className="mb-2 text-amber-400">
          Não foi possível atualizar. Consulte novamente antes de entregar ao cliente.
        </p>
      )}
      {code && (
        <>
          <p className="select-all break-all font-mono text-lg tracking-widest text-primary">
            {code.code}
          </p>
          <p className="mt-1 text-muted-foreground">
            Expira ao liberar a mesa. Limite de segurança:{" "}
            {new Date(code.expires_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            . Entregue apenas no salão.
          </p>
        </>
      )}
      {revealed && !code && !current.isFetching && !request.isPending && !current.isError && (
        <p className="mb-2 text-muted-foreground">
          Sem código ativo. Gere um novo para o próximo atendimento.
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={request.isPending || current.isFetching}
          onClick={() => {
            setRevealed(true);
            if (!code) request.mutate();
            else void current.refetch();
          }}
          className="underline"
        >
          {request.isPending ? "Aguarde…" : code ? "Consultar atual" : "Gerar código de 4 dígitos"}
        </button>
        {code && (
          <>
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard
                  .writeText(code.code)
                  .then(() => toast.success("Código copiado"))
                  .catch(() => toast.error("Selecione o código para copiar"))
              }
              className="underline"
            >
              Copiar
            </button>
            <button
              type="button"
              disabled={request.isPending}
              onClick={() => request.mutate()}
              className="underline"
            >
              Trocar código
            </button>
          </>
        )}
      </div>
    </div>
  );
}
