import { PlatformInsights } from "@/features/platform/platform-insights";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, ChevronRight, RefreshCw, Search, ShieldCheck, LogOut } from "lucide-react";
import { FluxLogo } from "@/components/brand/logo";
import { useAuth } from "@/features/auth/use-auth";
import {
  usePlatformAccess,
  listRestaurants,
  PLAN_LABELS,
  formatPlatformDate,
  platformMoney,
} from "@/features/platform/platform-api";
import { RestaurantManagementDetail } from "@/features/platform/restaurant-management-detail";
import { PlatformLogin } from "@/features/platform/platform-login";
import { getErrorDetails } from "@/lib/errors";
export const Route = createFileRoute("/gestao")({
  head: () => ({
    meta: [
      { title: "Gestão Flux — Restaurantes e clientes" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PlatformManagement,
});
function PlatformManagement() {
  const { user, loading, signOut } = useAuth();
  const access = usePlatformAccess();
  const qc = useQueryClient();
  const listRef = useRef<HTMLElement>(null);
  const [growthReady, setGrowthReady] = useState(false);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(input.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [input]);
  const list = useQuery({
    queryKey: ["platform-restaurants", user?.id, search, status, page],
    enabled: !!user && access.data === true,
    retry: false,
    gcTime: 0,
    refetchInterval: 60000,
    queryFn: () => listRestaurants(search, status, page),
  });
  function filterRestaurants(filter: string) {
    setStatus(filter);
    setPage(0);
    setInput("");
    setSearch("");
    listRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  }
  const missingSchema =
    access.isError && ["PGRST202", "42883"].includes(getErrorDetails(access.error).code ?? "");
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface/70">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <FluxLogo />
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="flex items-center gap-2 text-primary">
              <ShieldCheck className="h-4 w-4" />
              Gestão da plataforma
            </span>
            {user && (
              <>
                <span className="max-w-52 truncate text-muted-foreground">{user.email}</span>
                <button
                  aria-label="Sair da gestão"
                  onClick={() => void signOut()}
                  className="rounded-lg border border-border p-2"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      {loading || (!!user && access.isPending) ? (
        <p role="status" className="p-12 text-center">
          Verificando acesso…
        </p>
      ) : !user ? (
        <Gate
          title="Administração do Flux"
          body="Área privada do dono da plataforma. Acompanhe todos os restaurantes cadastrados e gerencie planos e períodos de teste."
        >
          <PlatformLogin />
        </Gate>
      ) : access.data !== true ? (
        <Gate
          title={missingSchema ? "Ative a central de gestão" : "Acesso restrito"}
          body={
            missingSchema
              ? "Execute o SQL de gestão para liberar sua conta de administrador no Supabase. Depois, atualize esta página."
              : access.isError
                ? "Não foi possível verificar sua autorização. Confira a conexão e tente novamente."
                : "Esta conta não tem permissão de administrador da plataforma. Os dados dos restaurantes estão protegidos."
          }
        >
          <button
            onClick={() => void access.refetch()}
            className="rounded-xl border border-border px-5 py-3 text-sm"
          >
            Verificar novamente
          </button>
        </Gate>
      ) : (
        <main className="mx-auto max-w-7xl space-y-7 px-4 py-8 md:px-6 md:py-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-primary">
                Central dos criadores
              </p>
              <h1 className="mt-2 font-display text-3xl tracking-tight md:text-5xl">
                Seu Flux, <span className="text-gradient-gold italic">por inteiro.</span>
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                Acompanhe os restaurantes, apoie a implantação e controle planos e períodos de teste
                em um só lugar.
              </p>
            </div>
            <button
              onClick={() => {
                void list.refetch();
                void qc.invalidateQueries({ queryKey: ["platform-growth"] });
              }}
              disabled={list.isFetching}
              className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${list.isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
          <PlatformInsights
            onSelect={setSelected}
            onFilter={filterRestaurants}
            onReady={setGrowthReady}
          />
          <section
            ref={listRef}
            className="scroll-mt-6 overflow-hidden rounded-2xl border border-border bg-surface"
          >
            <div className="flex flex-wrap items-center gap-3 border-b border-border p-4 md:p-5">
              <label className="relative min-w-48 flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <input
                  aria-label="Buscar restaurantes"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  maxLength={120}
                  placeholder="Buscar nome, endereço, responsável ou e-mail"
                  className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm"
                />
              </label>
              <select
                aria-label="Filtrar situação do cliente"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(0);
                }}
                className="max-w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              >
                <option value="all">Todos os clientes</option>
                <option value="trial">Trial ativo</option>
                <option value="expired">Trial encerrado</option>
                <option value="paid">Com plano</option>
                <option value="manual">Acesso manual</option>
                <optgroup label="Acompanhamento" disabled={!growthReady}>
                  <option value="manual_plan">Plano concedido manualmente (sem trial)</option>
                  <option value="ending">Trial vence em até 3 dias</option>
                  <option value="attention">Precisa de atenção</option>
                  <option value="setup">Implantação incompleta</option>
                  <option value="never_ordered">Sem primeiro pedido</option>
                  <option value="inactive">Sem pedidos há 10 dias</option>
                  <option value="active7">Com pedidos nos últimos 7 dias</option>
                  <option value="active">Com pedidos nos últimos 30 dias</option>
                  <option value="subscribed">Assinatura de produção ativa</option>
                </optgroup>
                <optgroup label="Novos cadastros" disabled={!growthReady}>
                  <option value="new7">Novos nos últimos 7 dias</option>
                  <option value="new30">Novos nos últimos 30 dias</option>
                  <option value="new90">Novos nos últimos 90 dias</option>
                </optgroup>
              </select>
            </div>
            {list.isPending ? (
              <p role="status" className="p-10 text-center text-sm text-muted-foreground">
                Carregando restaurantes…
              </p>
            ) : list.isError ? (
              <div role="alert" className="p-10 text-center">
                <p>Não foi possível carregar os restaurantes.</p>
                <button onClick={() => void list.refetch()} className="mt-3 text-sm underline">
                  Tentar novamente
                </button>
              </div>
            ) : list.data.items.length === 0 ? (
              <div className="p-12 text-center">
                <Building2 className="mx-auto h-8 w-8 text-primary" />
                <h2 className="mt-4 font-display text-xl">Nenhum restaurante encontrado</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {search || status !== "all"
                    ? "Tente outro nome ou remova o filtro."
                    : "Os restaurantes aparecerão aqui conforme forem cadastrados."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {list.data.items.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => setSelected(r.id)}
                      className="group grid w-full items-center gap-4 p-5 text-left transition hover:bg-background/50 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.name}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {r.owner_name ?? "Responsável"} · {r.owner_email ?? "Sem e-mail"}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          /m/{r.slug} · Cadastro{" "}
                          {new Date(r.created_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <div className="text-xs">
                        <span className="inline-flex rounded-full bg-gold-soft px-3 py-1 text-primary">
                          {PLAN_LABELS[r.entitlement.plan_type] ?? r.entitlement.plan_type}
                        </span>
                        <p className="mt-2 text-muted-foreground">
                          {r.entitlement.plan_type === "trial"
                            ? `${new Date(r.entitlement.trial_ends_at).getTime() < Date.now() ? "Encerrado" : "Até"} ${formatPlatformDate(r.entitlement.trial_ends_at)}`
                            : r.entitlement.plan_source === "manual"
                              ? "Concedido pela gestão"
                              : "Padrão / assinatura"}
                        </p>
                      </div>
                      <div className="text-sm">
                        {r.health && (
                          <div className="mb-3">
                            <p className="text-xs text-primary">
                              Implantação: {r.health.completed_steps}/4 etapas
                            </p>
                            <div className="mt-1 h-1 overflow-hidden rounded-full bg-background">
                              <div
                                className="h-full bg-primary/70"
                                style={{ width: (r.health.completed_steps / 4) * 100 + "%" }}
                              />
                            </div>
                          </div>
                        )}
                        <p>{r.orders_30d} pedidos · últimos 30 dias</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Entregues: {platformMoney(r.sales_30d, r.currency)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Último pedido: {formatPlatformDate(r.last_order_at)}
                        </p>
                      </div>
                      <ChevronRight className="hidden h-5 w-5 text-muted-foreground transition group-hover:translate-x-1 md:block" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {list.data && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-xs text-muted-foreground">
                <p>
                  {list.data.total} restaurante(s) · Página {page + 1} de{" "}
                  {Math.max(1, Math.ceil(list.data.total / 25))}
                </p>
                <div className="flex gap-3">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-lg border border-border px-3 py-2 disabled:opacity-30"
                  >
                    Anterior
                  </button>
                  <button
                    disabled={(page + 1) * 25 >= list.data.total}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-border px-3 py-2 disabled:opacity-30"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </section>
          <p className="text-xs text-muted-foreground">
            “Com plano” indica o acesso liberado, incluindo concessões manuais. Não representa
            pagamentos confirmados. Os indicadores de pedidos são dos restaurantes; assinaturas de
            teste aparecem separadas nos detalhes.
          </p>
          {selected && (
            <RestaurantManagementDetail id={selected} onClose={() => setSelected(null)} />
          )}
        </main>
      )}
    </div>
  );
}
function Gate({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-xl px-5 py-20 text-center">
      <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
      <h1 className="mt-6 font-display text-3xl">{title}</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-7 flex justify-center">{children}</div>
    </main>
  );
}
