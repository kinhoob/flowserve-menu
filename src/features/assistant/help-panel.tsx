import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { canAccess, useTrialStatus, type FeatureKey } from "@/features/billing/trial-status";
import { supabase } from "@/integrations/supabase/client";
import { searchHelp } from "./help-content";

export function HelpPanel({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<"pending" | "ready" | null>(null);
  const restaurant = useRestaurant();
  const plan = useTrialStatus();
  const allowed = canAccess(plan.data, "kitchen");
  const answer = useQuery({
    queryKey: ["assistant-orders", restaurant.data?.id, status],
    enabled: !!restaurant.data?.id && !!status && allowed,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurant.data!.id)
        .eq("archived", false)
        .eq("status", status!);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const results = searchHelp(search, pathname);
  return (
    <section className="mt-3 space-y-3" aria-label="Ajuda e consultas do Flux">
      <label className="block text-xs">
        O que você quer fazer?
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelected(null);
          }}
          placeholder="Busque: cores, QR, horários…"
          className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-sm"
        />
      </label>
      <div className="space-y-2">
        {results.map((article) => {
          const locked =
            "feature" in article && !canAccess(plan.data, article.feature as FeatureKey);
          return (
            <div key={article.title} className="rounded-xl border border-border p-2">
              <button
                aria-expanded={selected === article.title}
                className="min-h-10 w-full text-left text-xs font-medium"
                onClick={() => setSelected(selected === article.title ? null : article.title)}
              >
                {article.title}
              </button>
              {selected === article.title && (
                <div>
                  <ol className="list-decimal space-y-2 pl-4 text-xs leading-5 text-muted-foreground">
                    {article.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  {locked ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Recurso indisponível no plano atual. Confira seu plano nas configurações.
                    </p>
                  ) : (
                    <Link
                      to={article.path}
                      onClick={onNavigate}
                      className="mt-3 block py-2 text-xs text-primary"
                    >
                      Abrir esta tela →
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!results.length && (
          <p className="text-xs text-muted-foreground">
            Não encontrei essa orientação. Tente “cardápio”, “pedidos” ou “horários”.
          </p>
        )}
      </div>
      <div className="border-t border-border pt-3">
        <p className="text-xs font-semibold">Consultar minha operação</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Pedidos ativos do seu restaurante. Somente leitura.
        </p>
        {!allowed ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Consultas disponíveis para planos com acesso à cozinha.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {(["pending", "ready"] as const).map((value) => (
              <button
                key={value}
                onClick={() => {
                  if (status === value) void answer.refetch();
                  else setStatus(value);
                }}
                className="min-h-10 rounded-lg border border-border p-2 text-xs"
              >
                {value === "pending" ? "Quantos pedidos novos?" : "Quantos estão prontos?"}
              </button>
            ))}
          </div>
        )}
        {status && allowed && (
          <div className="mt-2 rounded-lg bg-primary/5 p-3 text-xs" role="status">
            {restaurant.isError || answer.isError ? (
              "Não consegui consultar os pedidos. Tente novamente."
            ) : !restaurant.data || answer.isFetching ? (
              "Consultando seus pedidos…"
            ) : (
              <>
                <p>
                  {answer.data} pedido(s){" "}
                  {status === "pending" ? "novo(s)" : "pronto(s) para entregar"}.
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Supabase · consulta às{" "}
                  {new Date(answer.dataUpdatedAt).toLocaleTimeString("pt-BR")}. Não atualiza
                  automaticamente.
                </p>
              </>
            )}
            <button
              className="mt-2 min-h-9 text-primary"
              disabled={answer.isFetching || !restaurant.data}
              onClick={() => void answer.refetch()}
            >
              Atualizar consulta
            </button>
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Orientações do Flux e consultas específicas. A campainha não altera dados por você.
      </p>
    </section>
  );
}
