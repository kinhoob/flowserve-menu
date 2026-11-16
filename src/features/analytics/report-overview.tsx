import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChartNoAxesCombined, Clock, Lightbulb } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { changePercent, dayLabel, type RestaurantReport } from "./report";
const mins = (n: number | null) =>
  n === null ? "Sem medição" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} min`;
export function ReportOverview({
  report,
  currency,
  target,
  onDay,
}: {
  report: RestaurantReport;
  currency: string;
  target: number;
  onDay: (day: number) => void;
}) {
  const [point, setPoint] = useState<number | null>(null);
  const { current: c, previous: p } = report;
  const money = (cents: number) => formatPrice(cents / 100, currency);
  const stats = [
    {
      name: "Vendas de itens",
      value: money(c.cents),
      current: c.cents,
      previous: p.cents,
      hint: `${c.sold} ${c.sold === 1 ? "pedido entregue" : "pedidos entregues"}`,
      lowerBetter: false,
    },
    {
      name: "Pedidos recebidos",
      value: String(c.total),
      current: c.total,
      previous: p.total,
      hint: "Inclui os cancelados",
      lowerBetter: false,
    },
    {
      name: "Ticket por pedido",
      value: money(c.ticketCents),
      current: c.ticketCents,
      previous: p.ticketCents,
      hint: "Itens entregues ÷ pedidos entregues",
      lowerBetter: false,
    },
    {
      name: "Cancelamentos",
      value: `${c.cancellationRate.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
      current: c.cancellationRate,
      previous: p.cancellationRate,
      hint: `${c.cancelled} de ${c.total} pedidos`,
      lowerBetter: true,
    },
  ];
  const max = Math.max(1, ...c.daily.map((d) => d.cents), ...p.daily.map((d) => d.cents));
  const index = Math.min(point ?? c.daily.length - 1, c.daily.length - 1);
  const focus = c.daily[index];
  const prior = p.daily[index];
  const peak = c.peak;
  const suggestions: string[] = [];
  const growth = changePercent(c.cents, p.cents);
  if (c.total > 0 && c.total < 10)
    suggestions.push(
      `A amostra tem ${c.total} pedidos. Amplie o período antes de tomar decisões sobre tendências.`,
    );
  if (growth !== null && c.sold > 0)
    suggestions.push(
      `As vendas de itens ${growth >= 0 ? "cresceram" : "caíram"} ${Math.abs(growth).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% frente ao período anterior equivalente.`,
    );
  if (peak.count > 0)
    suggestions.push(
      `${String(peak.hour).padStart(2, "0")}h concentra ${peak.count} pedidos não cancelados. Confira a preparação da equipe e o abastecimento nessa faixa.`,
    );
  if (c.overdue > 0)
    suggestions.push(
      `${c.overdue} pedido(s) em fila ou preparo já ultrapassam a meta de ${target} minutos. Confira o painel de pedidos.`,
    );
  if (c.preparation.samples >= 5 && c.preparation.p90 !== null)
    suggestions.push(
      `90% dos ${c.preparation.samples} preparos medidos ficaram em até ${mins(c.preparation.p90)}. ${c.overTarget} ultrapassaram a meta.`,
    );
  if (c.cancelled > 0)
    suggestions.push(
      `${c.cancelled} cancelamento(s) no período. Motivo mais registrado: ${c.reasons[0]?.[0] ?? "não informado"}. Revise os casos antes de atribuir uma causa.`,
    );
  const top = [...c.products].sort((a, b) => b.cents - a.cents)[0];
  if (top && c.cents > 0)
    suggestions.push(
      `${top.name} representa ${((top.cents / c.cents) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% das vendas de itens. Confira sua disponibilidade e os ingredientes.`,
    );
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <section key={s.name} className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{s.name}</p>
            <p className="mt-3 font-display text-3xl tracking-tight">{s.value}</p>
            <div className="mt-3">
              <Change
                current={s.current}
                previous={s.previous}
                lowerBetter={s.lowerBetter}
                percentagePoints={s.name === "Cancelamentos"}
                hasBaseline={p.total > 0}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{s.hint}</p>
          </section>
        ))}
      </div>
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-xl">O que compõe suas vendas</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Itens em contas encerradas", money(c.closedCents)],
            ["Itens entregues, conta aberta", money(c.deliveredCents)],
            ["Itens ainda em andamento", money(c.openCents)],
            [
              "Taxas de pedidos entregues",
              report.feesApplicable ? money(c.feesCents) : "Sem rateio por item",
            ],
          ].map(([name, value]) => (
            <div key={name}>
              <p className="text-xs text-muted-foreground">{name}</p>
              <p className="mt-2 text-lg font-medium">{value}</p>
            </div>
          ))}
        </div>
        {c.unconfirmed > 0 && (
          <p className="mt-4 rounded-xl border border-amber-400/30 p-3 text-xs">
            {c.unconfirmed} pedido(s) foram encerrados sem registro de entrega. Seus itens somam{" "}
            {money(c.unconfirmedCents)} e ficam fora das vendas. Confira a situação no histórico.
          </p>
        )}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Os indicadores de vendas usam preço e quantidade dos itens entregues, incluindo
          adicionais. Taxas e couvert ficam separados e só são exibidos sem filtro de setor ou
          categoria. Encerrar uma conta não confirma recebimento de pagamento.
        </p>
      </section>
      <section className="rounded-2xl border border-border bg-surface p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-xl">
              <ChartNoAxesCombined className="h-5 w-5 text-primary" />
              Vendas por dia de operação
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Passe o mouse ou use Tab para consultar. Toque em uma barra para analisar aquele dia.
            </p>
          </div>
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-2">
              <i className="h-2 w-2 rounded-full bg-primary" />
              Atual
            </span>
            <span className="flex items-center gap-2 text-muted-foreground">
              <i className="h-2 w-2 rounded-full bg-muted-foreground/50" />
              Anterior
            </span>
          </div>
        </div>
        <p aria-live="polite" className="mt-5 min-h-10 text-sm">
          <strong>{dayLabel(focus.day)}</strong> · {money(focus.cents)} · {focus.orders} pedidos não
          cancelados{" "}
          <span className="text-muted-foreground">
            / Anterior ({dayLabel(prior.day)}): {money(prior.cents)}
          </span>
        </p>
        <div className="mt-4 overflow-x-auto pb-2">
          <div
            className="flex h-48 items-end gap-1.5"
            style={{ minWidth: Math.max(380, c.daily.length * 22) }}
          >
            {c.daily.map((d, i) => (
              <button
                key={d.day}
                aria-label={`${dayLabel(d.day)}: ${money(d.cents)}. Anterior: ${money(p.daily[i].cents)}. Analisar este dia.`}
                onMouseEnter={() => setPoint(i)}
                onFocus={() => setPoint(i)}
                onClick={() => onDay(d.day)}
                className="group flex h-full min-w-0 flex-1 items-end gap-0.5 rounded-t-lg border-b border-border px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span
                  className="w-1/2 rounded-t-sm bg-primary/85 transition-all duration-300 group-hover:bg-primary"
                  style={{ height: `${Math.max(d.cents ? 2 : 0, (d.cents / max) * 100)}%` }}
                />
                <span
                  className="w-1/2 rounded-t-sm bg-muted-foreground/30"
                  style={{
                    height: `${Math.max(p.daily[i].cents ? 2 : 0, (p.daily[i].cents / max) * 100)}%`,
                  }}
                />
              </button>
            ))}
          </div>
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>{dayLabel(c.daily[0].day)}</span>
          <span>{dayLabel(c.daily[c.daily.length - 1].day)}</span>
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 font-display text-xl">
            <Clock className="h-5 w-5 text-primary" />
            Onde o atendimento demora
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Tempos do pedido completo, inclusive quando mistura cozinha e bar. Registros ausentes,
            invertidos ou acima de 24h não entram nas medições.
          </p>
          <div className="mt-5 space-y-4">
            {[
              ["Na fila até começar", c.queue, p.queue],
              ["Em preparo até ficar pronto", c.preparation, p.preparation],
              ["Pronto até a entrega", c.delivery, p.delivery],
            ].map(([label, current, previous]) => {
              const a = current as typeof c.queue,
                b = previous as typeof p.queue;
              return (
                <div
                  key={String(label)}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3"
                >
                  <div>
                    <p className="text-sm">{String(label)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.samples} medições · mediana {mins(a.median)} · P90 {mins(a.p90)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-medium">{mins(a.mean)}</p>
                    {a.mean !== null && b.mean !== null && (
                      <Change current={a.mean} previous={b.mean} lowerBetter />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Meta de fila/preparo: {target} min · {c.overTarget} de {c.preparation.samples} preparos
            medidos acima da meta · {c.overdue} pedidos atuais aguardando além da meta.
          </p>
        </section>
        <section className="rounded-2xl border border-primary/25 bg-surface p-5">
          <h2 className="flex items-center gap-2 font-display text-xl">
            <Lightbulb className="h-5 w-5 text-primary" />
            Leituras do período
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Sugestões calculadas com os dados e filtros desta tela.
          </p>
          {suggestions.length ? (
            <ul className="mt-4 space-y-3 text-sm">
              {suggestions.map((s) => (
                <li key={s} className="rounded-xl bg-background/70 p-3 leading-relaxed">
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              Ainda não há dados suficientes. Registre pedidos para acompanhar as tendências.
            </p>
          )}
        </section>
      </div>
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-xl">Dias e horários de maior movimento</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Pedidos não cancelados, contados uma vez por seleção. A linha corresponde ao dia de
          operação; a coluna mostra a hora local.
        </p>
        <div className="mt-5 overflow-x-auto">
          <div style={{ minWidth: 650 }}>
            <div
              className="ml-12 grid grid-cols-24 gap-1"
              style={{ gridTemplateColumns: "repeat(24,minmax(0,1fr))" }}
            >
              {c.hourly.map((h) => (
                <span key={h.hour} className="text-center text-[10px] text-muted-foreground">
                  {h.hour}
                </span>
              ))}
            </div>
            {c.heat.map((hours, i) => (
              <div key={i} className="mt-1 flex items-center gap-2">
                <span className="w-10 shrink-0 text-xs text-muted-foreground">
                  {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][i]}
                </span>
                <div
                  className="grid flex-1 gap-1"
                  style={{ gridTemplateColumns: "repeat(24,minmax(0,1fr))" }}
                >
                  {hours.map((count, h) => {
                    const maxCount = Math.max(1, ...c.heat.flat());
                    return (
                      <div
                        key={h}
                        tabIndex={0}
                        aria-label={`${["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"][i]}, ${h}h: ${count} pedidos`}
                        title={`${h}h · ${count} pedidos`}
                        className="flex h-7 items-center justify-center rounded text-[10px] outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        style={{
                          background: `rgb(215 181 109 / ${0.05 + (count / maxCount) * 0.75})`,
                        }}
                      >
                        {count || "·"}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
export function Change({
  current,
  previous,
  lowerBetter = false,
  percentagePoints = false,
  hasBaseline = true,
}: {
  current: number;
  previous: number;
  lowerBetter?: boolean;
  percentagePoints?: boolean;
  hasBaseline?: boolean;
}) {
  const difference = percentagePoints ? current - previous : changePercent(current, previous);
  if (difference === null || !hasBaseline)
    return (
      <span className="text-xs text-muted-foreground">
        {current > 0 ? "Novo movimento · sem base anterior" : "Sem base anterior"}
      </span>
    );
  if (Math.abs(difference) < 0.05)
    return <span className="text-xs text-muted-foreground">Estável em relação ao anterior</span>;
  const good = lowerBetter ? difference < 0 : difference > 0;
  const Icon = difference > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${good ? "text-emerald-400" : "text-amber-400"}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {difference > 0 ? "+" : ""}
      {difference.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
      {percentagePoints ? " p.p." : "%"} vs. anterior
    </span>
  );
}
