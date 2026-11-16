import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowUpRight, CheckCircle2, Clock, Store, TrendingUp } from "lucide-react";
import { useAuth } from "@/features/auth/use-auth";
import { getErrorDetails } from "@/lib/errors";
import { platformGrowth, formatPlatformDate } from "./platform-api";
import {
  attentionReasons,
  ONBOARDING_STEPS,
  ratioPercent,
  registrationChange,
  type RestaurantHealth,
} from "./platform-health";
const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
export function OnboardingChecklist({ health }: { health: RestaurantHealth }) {
  return (
    <section className="rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Implantação do restaurante</h3>
        <span className="rounded-full bg-gold-soft px-3 py-1 text-xs text-primary">
          {health.completed_steps} de 4 etapas
        </span>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {ONBOARDING_STEPS.map((step) => (
          <li key={step.key} className="flex items-start gap-3 rounded-xl bg-background/60 p-3">
            {health[step.key] ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-medium">{step.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Etapas independentes para acompanhar a implantação; não bloqueiam o uso. Primeiro pedido:{" "}
        {formatPlatformDate(health.first_order_at)}.
      </p>
    </section>
  );
}
export function PlatformInsights({
  onSelect,
  onFilter,
  onReady,
}: {
  onSelect: (id: string) => void;
  onFilter: (filter: string) => void;
  onReady: (ready: boolean) => void;
}) {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [expanded, setExpanded] = useState(false);
  const [point, setPoint] = useState<number | null>(null);
  const query = useQuery({
    queryKey: ["platform-growth", user?.id, days],
    queryFn: () => platformGrowth(days),
    enabled: !!user,
    retry: false,
    gcTime: 0,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });
  const missing =
    query.isError && ["PGRST202", "42883"].includes(getErrorDetails(query.error).code ?? "");
  useEffect(() => {
    if (query.data) onReady(true);
    else if (missing) onReady(false);
  }, [query.data, missing, onReady]);
  const data = query.data;
  const max = Math.max(1, ...(data?.registrations.map((day) => day.count) ?? []));
  const selected =
    data?.registrations[
      Math.min(point ?? data.registrations.length - 1, data.registrations.length - 1)
    ];
  const date = (value: string) =>
    new Date(`${value}T12:00:00Z`).toLocaleDateString("pt-BR", {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
    });
  const percent = data ? ratioPercent(data.cohort.converted, data.cohort.accounts) : null;
  const change = data
    ? registrationChange(data.totals.new_restaurants, data.totals.previous_new)
    : null;
  return (
    <section aria-label="Indicadores da plataforma" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Crescimento e primeiros passos</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Visão geral do Flux. A busca abaixo filtra somente a lista de restaurantes.
          </p>
        </div>
        <label className="text-xs text-muted-foreground">
          Período de cadastros
          <select
            aria-label="Período dos indicadores da plataforma"
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
              setPoint(null);
            }}
            className="ml-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground"
          >
            {[7, 30, 90].map((n) => (
              <option key={n} value={n}>
                {n} dias
              </option>
            ))}
          </select>
        </label>
      </div>
      {query.isError ? (
        <div role="alert" className="rounded-2xl border border-amber-400/30 bg-surface p-5 text-sm">
          <p>
            {missing
              ? "Execute o SQL de crescimento da gestão para ativar os novos indicadores. A lista e as ações dos clientes continuam disponíveis."
              : "Não foi possível atualizar os indicadores gerais. Tente novamente antes de usar esses números."}
          </p>
          <button onClick={() => void query.refetch()} className="mt-3 text-xs underline">
            Verificar novamente
          </button>
        </div>
      ) : query.isPending ? (
        <p
          role="status"
          className="rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground"
        >
          Preparando a visão geral do Flux…
        </p>
      ) : (
        data && (
          <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                {
                  label: "Restaurantes cadastrados",
                  value: data.totals.restaurants,
                  hint: "Todos os cadastros da plataforma",
                  filter: "all",
                },
                {
                  label: `Novos em ${days} dias`,
                  value: data.totals.new_restaurants,
                  hint:
                    change === null
                      ? "Sem base anterior para comparar"
                      : `${change > 0 ? "+" : ""}${number(change)}% vs. período anterior`,
                  filter: `new${days}`,
                },
                {
                  label: "Ativos nos últimos 7 dias",
                  value: data.totals.active_7d,
                  hint: "Com pedido não cancelado",
                  filter: "active7",
                },
                {
                  label: "Ativos nos últimos 30 dias",
                  value: data.totals.active_30d,
                  hint: "Atividade operacional registrada",
                  filter: "active",
                },
              ].map((card) => (
                <button
                  key={card.label}
                  onClick={() => onFilter(card.filter)}
                  className="rounded-2xl border border-border bg-surface p-4 text-left transition hover:border-primary/40 md:p-5"
                >
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className="mt-3 font-display text-3xl">{number(card.value)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{card.hint}</p>
                </button>
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="min-w-0 rounded-2xl border border-border bg-surface p-5">
                <h3 className="flex items-center gap-2 font-display text-xl">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Novos restaurantes
                </h3>
                <p className="mt-2 text-xs text-muted-foreground">
                  Cadastros por dia, no fuso {data.timezone}. A comparação anterior vai até o mesmo
                  horário local de hoje.
                </p>
                <p aria-live="polite" className="mt-4 min-h-5 text-sm">
                  {selected
                    ? `${date(selected.date)} · ${selected.count} restaurante(s) cadastrado(s)`
                    : "Nenhum cadastro neste período."}
                </p>
                <div className="mt-4 overflow-x-auto pb-2">
                  <div
                    className="flex h-32 items-end gap-1"
                    style={{ minWidth: Math.max(260, data.registrations.length * 12) }}
                  >
                    {data.registrations.map((day, i) => (
                      <button
                        key={day.date}
                        aria-label={`${date(day.date)}: ${day.count} novos restaurantes`}
                        title={`${date(day.date)} · ${day.count}`}
                        onFocus={() => setPoint(i)}
                        onMouseEnter={() => setPoint(i)}
                        onClick={() => setPoint(i)}
                        className="flex h-full min-w-0 flex-1 items-end rounded-t-sm border-b border-border outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <span
                          className="w-full rounded-t-sm bg-primary/75 transition-all duration-300"
                          style={{
                            height: `${day.count ? Math.max(4, (day.count / max) * 100) : 0}%`,
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>{data.registrations[0] ? date(data.registrations[0].date) : ""}</span>
                  <span>
                    {data.registrations.length
                      ? date(data.registrations[data.registrations.length - 1].date)
                      : ""}
                  </span>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Atual: {formatPlatformDate(data.period_start)} até{" "}
                  {formatPlatformDate(data.generated_at)} · Anterior:{" "}
                  {formatPlatformDate(data.previous_start)} até{" "}
                  {formatPlatformDate(data.previous_end)}.
                </p>
              </section>
              <section className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-display text-xl">
                    <Store className="h-4 w-4 text-primary" />
                    Progresso da implantação
                  </h3>
                  <button
                    onClick={() => onFilter("setup")}
                    className="text-xs text-primary underline"
                  >
                    Ver implantações
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {data.totals.ready} de {data.totals.restaurants} restaurantes completaram as
                  quatro etapas. As etapas são independentes.
                </p>
                <div className="mt-5 space-y-4">
                  {ONBOARDING_STEPS.map((step) => (
                    <div key={step.count}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span>{step.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {data.onboarding[step.count]} / {data.totals.restaurants}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
                        <div
                          className="h-full rounded-full bg-primary/75 transition-all duration-300"
                          style={{
                            width: `${ratioPercent(data.onboarding[step.count], data.totals.restaurants) ?? 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Mesas criadas não comprovam impressão do QR Code. Um primeiro pedido não cancelado
                  demonstra uso, mas pode ser um teste do restaurante.
                </p>
              </section>
            </div>
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h3 className="font-display text-xl">Trials e conversão para assinatura</h3>
              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  {
                    label: "Restaurantes em trial",
                    value: String(data.totals.trial_active),
                    filter: "trial",
                  },
                  {
                    label: "Vencem em até 3 dias",
                    value: String(data.totals.trial_ending),
                    filter: "ending",
                  },
                  {
                    label: "Trials encerrados",
                    value: String(data.totals.trial_expired),
                    filter: "expired",
                  },
                  {
                    label: "Conversão da coorte",
                    value: percent === null ? "Sem coorte" : `${number(percent)}%`,
                    filter: "subscribed",
                  },
                ].map((card) => (
                  <button
                    key={card.label}
                    onClick={() => onFilter(card.filter)}
                    className="rounded-xl border border-border bg-background/60 p-4 text-left transition hover:border-primary/30"
                  >
                    <p className="text-xs text-muted-foreground">{card.label}</p>
                    <p className="mt-3 font-display text-2xl">{card.value}</p>
                  </button>
                ))}
              </div>
              <p className="mt-4 text-sm">
                {data.cohort.converted} de {data.cohort.accounts} contas com restaurante cadastradas
                no período têm assinatura de produção com status ativo. {data.cohort.manual_only}{" "}
                receberam plano manual e não têm assinatura ativa.
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <button onClick={() => onFilter("subscribed")} className="underline">
                  {data.totals.subscriptions_active} contas com assinatura ativa no total
                </button>
                <button onClick={() => onFilter("manual_plan")} className="underline">
                  {data.totals.manual_plans} contas com plano concedido manualmente
                </button>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Os contadores de trial e implantação são por restaurante; conversão e assinaturas
                são por conta. A conversão reflete o status atual registrado. Assinaturas de teste e
                cortesias sem assinatura ativa ficam fora da conversão. Status ativo não comprova
                pagamento recebido. Acessos bloqueados por cobrança não contam como trials
                encerrados.
              </p>
            </section>
            <section className="rounded-2xl border border-primary/25 bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 font-display text-xl">
                    <AlertCircle className="h-4 w-4 text-primary" />
                    Precisa da sua atenção
                  </h3>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {data.totals.attention} restaurante(s) com alertas. Cada restaurante aparece uma
                    vez, com os motivos agrupados.
                  </p>
                </div>
                <button
                  onClick={() => onFilter("attention")}
                  className="inline-flex items-center gap-1 text-xs text-primary underline"
                >
                  Ver todos na lista
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
              {data.attention.length ? (
                <>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {data.attention.slice(0, expanded ? 20 : 6).map((health) => (
                      <button
                        key={health.id}
                        onClick={() => onSelect(health.id)}
                        className="rounded-xl border border-border bg-background/60 p-4 text-left transition hover:border-primary/40"
                      >
                        <p className="font-medium">{health.name}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {health.owner_email ?? "E-mail não registrado"} · {health.completed_steps}
                          /4 etapas
                        </p>
                        <ul className="mt-3 space-y-1 text-xs text-amber-300">
                          {attentionReasons(health).map((reason) => (
                            <li key={reason.key}>• {reason.label}</li>
                          ))}
                        </ul>
                        {health.trial_ending && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Vence: {formatPlatformDate(health.entitlement.trial_ends_at)}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-muted-foreground">
                          Último pedido: {formatPlatformDate(health.last_order_at)}
                        </p>
                        <span className="mt-3 inline-block text-xs text-primary">
                          Abrir ficha e acompanhar →
                        </span>
                      </button>
                    ))}
                  </div>
                  {data.attention.length > 6 && !expanded && (
                    <button
                      onClick={() => setExpanded(true)}
                      className="mt-4 rounded-xl border border-border px-4 py-2 text-xs"
                    >
                      Mostrar até 20 alertas prioritários
                    </button>
                  )}
                  {data.totals.attention > data.attention.length && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      A prévia mostra {data.attention.length} de {data.totals.attention}{" "}
                      restaurantes. Use a lista para acessar todos.
                    </p>
                  )}
                </>
              ) : (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-dashed border-border p-5">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum alerta agora. Os avisos acompanham trials próximos do vencimento,
                    implantação incompleta após dois dias, dez dias sem pedidos e assinaturas que
                    precisam de revisão.
                  </p>
                </div>
              )}
            </section>
            <p role="status" className="text-right text-xs text-muted-foreground">
              {query.isFetching
                ? "Atualizando indicadores…"
                : `Indicadores atualizados em ${formatPlatformDate(data.generated_at)} · consulta automática a cada minuto`}
            </p>
          </>
        )
      )}
    </section>
  );
}
