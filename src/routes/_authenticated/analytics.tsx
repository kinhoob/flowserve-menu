import { ReportQuickAnswers } from "@/features/analytics/report-quick-answers";
import { orderCsv } from "@/features/analytics/report-export";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, RefreshCw } from "lucide-react";
import { FeatureLocked } from "@/features/billing/trial-guard";
import { canAccess, useTrialStatus } from "@/features/billing/trial-status";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { downloadCsv } from "@/features/menu/catalog-csv";
import { ReportOverview } from "@/features/analytics/report-overview";
import { ReportHistory, ReportProducts } from "@/features/analytics/report-tables";
import { useReportOrders } from "@/features/analytics/use-report-orders";
import {
  buildReport,
  businessDay,
  dayInput,
  dayLabel,
  defaultCutoff,
  parseDay,
  timeMinutes,
  type Department,
} from "@/features/analytics/report";
export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Análises — Flux Menu" }] }),
  component: AnalyticsPage,
});
const PRESETS = [
  { value: "today", label: "Hoje", days: 1 },
  { value: "7d", label: "7 dias", days: 7 },
  { value: "30d", label: "30 dias", days: 30 },
  { value: "90d", label: "90 dias", days: 90 },
];
const SHIFTS: Record<string, { label: string; from: number | null; to: number | null }> = {
  all: { label: "Todos os horários", from: null, to: null },
  lunch: { label: "Almoço · 11h–17h", from: 660, to: 1020 },
  evening: { label: "Noite · 17h–00h", from: 1020, to: 0 },
  overnight: { label: "Madrugada · 00h–06h", from: 0, to: 360 },
  custom: { label: "Horário personalizado", from: null, to: null },
};
const DEPARTMENTS: Record<Department, string> = {
  all: "Cozinha e bar",
  food: "Somente cozinha",
  drink: "Somente bar",
  unknown: "Sem classificação",
};
function AnalyticsPage() {
  const restaurantQuery = useRestaurant();
  const restaurant = restaurantQuery.data;
  const plan = useTrialStatus();
  const timezone = restaurant?.timezone ?? "America/Sao_Paulo";
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const [comparison, setComparison] = useState<"previous" | "weekday">("weekday");
  const [preset, setPreset] = useState("7d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [cutoffOverride, setCutoffOverride] = useState<string | null>(null);
  const cutoffInput = cutoffOverride ?? defaultCutoff(restaurant?.operating_hours);
  const cutoff = timeMinutes(cutoffInput);
  const today = businessDay(now, timezone, cutoff ?? 0);
  const presetDays = PRESETS.find((p) => p.value === preset)?.days ?? 7;
  const startInput = preset === "custom" ? customStart : dayInput(today - presetDays + 1),
    endInput = preset === "custom" ? customEnd : dayInput(today);
  const start = parseDay(startInput),
    end = parseDay(endInput);
  const [department, setDepartment] = useState<Department>("all");
  const [category, setCategory] = useState("all");
  const [shift, setShift] = useState("all");
  const [shiftFrom, setShiftFrom] = useState("18:00");
  const [shiftTo, setShiftTo] = useState("02:00");
  const [targetInput, setTargetInput] = useState("20");
  const shiftStart = shift === "custom" ? timeMinutes(shiftFrom) : SHIFTS[shift].from,
    shiftEnd = shift === "custom" ? timeMinutes(shiftTo) : SHIFTS[shift].to;
  const target = Number(targetInput);
  const error =
    start === null || end === null
      ? "Preencha as datas inicial e final."
      : end < start
        ? "A data final deve ser igual ou posterior à inicial."
        : end - start >= 93
          ? "Selecione até 93 dias para analisar e comparar com o período anterior."
          : end > today
            ? "A data final não pode ultrapassar o dia de operação atual."
            : cutoff === null
              ? "Preencha a hora em que o dia de operação muda."
              : shift === "custom" &&
                  (shiftStart === null || shiftEnd === null || shiftStart === shiftEnd)
                ? "Escolha horários de início e fim diferentes para o turno."
                : !Number.isInteger(target) || target < 1 || target > 180
                  ? "A meta de atendimento deve estar entre 1 e 180 minutos."
                  : null;
  const filters = useMemo(
    () => ({
      start: start ?? today,
      end: end ?? today,
      timezone,
      cutoff: cutoff ?? 0,
      department,
      category,
      shiftStart,
      shiftEnd,
      comparison,
      targetMinutes: Number.isInteger(target) && target >= 1 && target <= 180 ? target : 20,
    }),
    [
      start,
      end,
      today,
      timezone,
      cutoff,
      department,
      category,
      shiftStart,
      shiftEnd,
      target,
      comparison,
    ],
  );
  const authorized = !!plan.data && canAccess(plan.data, "analytics");
  const query = useReportOrders(
    restaurant?.id,
    filters.start -
      (comparison === "weekday"
        ? Math.ceil((filters.end - filters.start + 1) / 7) * 7
        : filters.end - filters.start + 1),
    filters.end,
    !error && authorized,
  );
  const report = useMemo(
    () => (!error && query.data ? buildReport(query.data, filters, now) : null),
    [error, query.data, filters, now],
  );
  function setDate(field: "start" | "end", value: string) {
    setCustomStart(field === "start" ? value : startInput);
    setCustomEnd(field === "end" ? value : endInput);
    setPreset("custom");
  }
  if (restaurantQuery.isLoading || plan.isPending)
    return (
      <p role="status" className="py-20 text-center text-sm text-muted-foreground">
        Preparando suas análises…
      </p>
    );
  if (!restaurant || !plan.data)
    return (
      <div className="p-8 text-center">
        <p>Não foi possível verificar o restaurante e seu plano.</p>
        <button
          onClick={() => void Promise.all([restaurantQuery.refetch(), plan.refetch()])}
          className="mt-4 underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  if (!authorized) return <FeatureLocked feature="analytics" />;
  const currency = restaurant.currency ?? "BRL";
  const filename = `flux-${restaurant.slug}-${startInput}-${endInput}`;
  const ready = !!report && !query.isError && !query.isFetching;
  const categories = report?.categories ?? [];
  const selectionKey = [
    filters.start,
    filters.end,
    cutoff,
    department,
    category,
    shift,
    shiftFrom,
    shiftTo,
  ].join(":");
  function exportSummary() {
    if (!report) return;
    const c = report.current,
      p = report.previous;
    downloadCsv(`${filename}-resumo.csv`, [
      ["Indicador", "Atual", "Anterior"],
      ["Início", startInput, dayInput(report.previousStart)],
      ["Fim", endInput, dayInput(report.previousEnd)],
      ["Fuso", timezone, timezone],
      [
        "Comparação",
        comparison === "weekday" ? "Mesmos dias da semana" : "Período anterior",
        "Mesma seleção",
      ],
      ["Dia começa às", cutoffInput, cutoffInput],
      ["Setor", DEPARTMENTS[department], DEPARTMENTS[department]],
      [
        "Categoria",
        category === "all"
          ? "Todas"
          : (categories.find((c) => c.id === category)?.name ?? category),
        "Mesma seleção",
      ],
      [
        "Horário",
        shift === "custom" ? `${shiftFrom}–${shiftTo}` : SHIFTS[shift].label,
        "Mesma seleção",
      ],
      [
        "Comparação parcial",
        report.partial ? "Até o horário local atual" : "Período completo",
        "Mesmo critério",
      ],
      ["Moeda", currency, currency],
      ["Vendas de itens entregues", (c.cents / 100).toFixed(2), (p.cents / 100).toFixed(2)],
      [
        "Itens em contas encerradas",
        (c.closedCents / 100).toFixed(2),
        (p.closedCents / 100).toFixed(2),
      ],
      [
        "Itens entregues com conta aberta",
        (c.deliveredCents / 100).toFixed(2),
        (p.deliveredCents / 100).toFixed(2),
      ],
      [
        "Taxas de pedidos entregues",
        report.feesApplicable ? (c.feesCents / 100).toFixed(2) : "Não rateadas",
        report.feesApplicable ? (p.feesCents / 100).toFixed(2) : "Não rateadas",
      ],
      ["Pedidos recebidos", c.total, p.total],
      ["Pedidos entregues", c.sold, p.sold],
      ["Pedidos em andamento", c.open, p.open],
      ["Contas encerradas sem entrega registrada", c.unconfirmed, p.unconfirmed],
      [
        "Itens encerrados sem entrega (fora das vendas)",
        (c.unconfirmedCents / 100).toFixed(2),
        (p.unconfirmedCents / 100).toFixed(2),
      ],
      [
        "Ticket de itens por pedido entregue",
        (c.ticketCents / 100).toFixed(2),
        (p.ticketCents / 100).toFixed(2),
      ],
      ["Pedidos cancelados", c.cancelled, p.cancelled],
      ["Taxa de cancelamento (%)", c.cancellationRate.toFixed(2), p.cancellationRate.toFixed(2)],
      [
        "Preparo médio (min)",
        c.preparation.mean ?? "Sem medição",
        p.preparation.mean ?? "Sem medição",
      ],
      ["Amostras de preparo", c.preparation.samples, p.preparation.samples],
      [
        "Mediana de preparo (min)",
        c.preparation.median ?? "Sem medição",
        p.preparation.median ?? "Sem medição",
      ],
      [
        "P90 de preparo (min)",
        c.preparation.p90 ?? "Sem medição",
        p.preparation.p90 ?? "Sem medição",
      ],
      ["Observação", "Vendas e contas encerradas não comprovam pagamento.", "Mesma definição"],
    ]);
  }
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-primary">
            Análises do restaurante
          </p>
          <h1 className="mt-2 font-display text-3xl tracking-tight md:text-4xl">
            Decisões com <span className="text-gradient-gold italic">mais clareza.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Compare suas vendas, acompanhe o atendimento e descubra os produtos e horários que
            movimentam o salão.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void query.refetch()}
            disabled={!!error || query.isFetching}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-xs disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <button
            onClick={exportSummary}
            disabled={!ready}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar resumo
          </button>
        </div>
      </header>
      {report && !query.isError && <ReportQuickAnswers report={report} currency={currency} />}
      <details
        aria-label="Filtros das análises"
        className="space-y-5 rounded-2xl border border-border bg-surface p-4 md:p-5"
      >
        <summary className="min-h-11 cursor-pointer text-sm font-medium">
          Período e filtros · {startInput} a {endInput}
        </summary>
        <label className="block text-sm">
          Comparar com
          <select
            value={comparison}
            onChange={(e) => setComparison(e.target.value as "previous" | "weekday")}
            className="ml-3 rounded-xl border border-border bg-background p-3"
          >
            <option value="weekday">Mesmos dias da semana anteriores</option>
            <option value="previous">Período imediatamente anterior</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPreset(p.value)}
              aria-pressed={preset === p.value}
              className={`rounded-xl border px-4 py-2 text-xs transition ${preset === p.value ? "border-primary/40 bg-gold-soft text-primary" : "border-border text-muted-foreground"}`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => {
              setPreset("7d");
              setDepartment("all");
              setCategory("all");
              setShift("all");
              setCutoffOverride(null);
              setTargetInput("20");
            }}
            className="ml-auto rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground"
          >
            Restaurar filtros
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <label className="min-w-0 text-xs text-muted-foreground">
            Data inicial
            <input
              type="date"
              aria-label="Data inicial"
              value={startInput}
              max={dayInput(today)}
              onInput={(e) => setDate("start", e.currentTarget.value)}
              onChange={(e) => setDate("start", e.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground"
            />
          </label>
          <label className="min-w-0 text-xs text-muted-foreground">
            Data final
            <input
              type="date"
              aria-label="Data final"
              value={endInput}
              max={dayInput(today)}
              onInput={(e) => setDate("end", e.currentTarget.value)}
              onChange={(e) => setDate("end", e.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground"
            />
          </label>
          <label className="min-w-0 text-xs text-muted-foreground">
            Setor
            <select
              aria-label="Setor"
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value as Department);
                setCategory("all");
              }}
              className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground"
            >
              {Object.entries(DEPARTMENTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-xs text-muted-foreground">
            Categoria
            <select
              aria-label="Categoria"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground"
            >
              <option value="all">Todas as categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              {category !== "all" && !categories.some((c) => c.id === category) && (
                <option value={category}>Categoria selecionada, sem registros</option>
              )}
            </select>
          </label>
        </div>
        <details className="space-y-4 rounded-xl border border-border p-3">
          <summary className="cursor-pointer text-xs font-medium">
            Turnos, madrugada e metas
          </summary>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <label className="min-w-0 text-xs text-muted-foreground">
              Horário do pedido
              <select
                aria-label="Horário do pedido"
                value={shift}
                onChange={(e) => setShift(e.target.value)}
                className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground"
              >
                {Object.entries(SHIFTS).map(([value, s]) => (
                  <option key={value} value={value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-xs text-muted-foreground">
              Dia de operação começa às
              <input
                type="time"
                value={cutoffInput}
                onChange={(e) => setCutoffOverride(e.target.value)}
                className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground"
              />
            </label>
            <label className="min-w-0 text-xs text-muted-foreground">
              Meta de fila/preparo (min)
              <input
                type="number"
                min={1}
                max={180}
                step={1}
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground"
              />
            </label>
            <div className="self-end rounded-xl bg-background/60 p-3 text-xs text-muted-foreground">
              <p>Fuso: {timezone}</p>
              <p className="mt-1">Histórico atualizado a cada minuto.</p>
            </div>
          </div>
          {shift === "custom" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="min-w-0 text-xs text-muted-foreground">
                Turno começa às
                <input
                  type="time"
                  value={shiftFrom}
                  onChange={(e) => setShiftFrom(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground"
                />
              </label>
              <label className="min-w-0 text-xs text-muted-foreground">
                Turno termina às
                <input
                  type="time"
                  value={shiftTo}
                  onChange={(e) => setShiftTo(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground"
                />
              </label>
            </div>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            A hora de virada organiza a madrugada e pode ser ajustada ao seu fechamento. Exemplo:
            com virada às 04h, um pedido de sábado à 01h conta na operação de sexta. Esse filtro não
            altera os horários de recebimento de pedidos.
          </p>
        </details>
        <p className="text-xs text-muted-foreground">
          Fuso: {timezone} · Dia vira às {cutoffInput} ·{" "}
          {shift === "custom" ? `${shiftFrom}–${shiftTo}` : SHIFTS[shift].label}
        </p>
      </details>
      {error ? (
        <p role="alert" className="rounded-xl border border-amber-400/40 p-4 text-sm">
          {error}
        </p>
      ) : query.isError ? (
        <div role="alert" className="rounded-xl border border-amber-400/40 p-5 text-sm">
          <p>
            Não foi possível carregar todo o histórico. Os indicadores e as exportações ficam
            indisponíveis para evitar totais incompletos.
          </p>
          <button onClick={() => void query.refetch()} className="mt-3 underline">
            Tentar novamente
          </button>
        </div>
      ) : !report ? (
        <p role="status" className="py-12 text-center text-sm text-muted-foreground">
          Carregando o período selecionado e sua comparação…
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p>
              Atual:{" "}
              <strong className="text-foreground">
                {dayLabel(filters.start)}–{dayLabel(filters.end)}
              </strong>{" "}
              · Anterior equivalente: {dayLabel(report.previousStart)}–
              {dayLabel(report.previousEnd)}
              {report.partial ? " · comparação até o mesmo horário local de hoje" : ""}
            </p>
            <p role="status">
              {query.isFetching
                ? "Atualizando dados…"
                : `Última consulta: ${new Date(query.dataUpdatedAt).toLocaleTimeString("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })}`}
            </p>
          </div>
          {(report.current.legacy > 0 ||
            report.current.unknown > 0 ||
            report.unclassifiedInPeriod > report.current.unknown ||
            report.current.missingItems > 0) && (
            <div className="rounded-xl border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
              {report.current.legacy > 0 &&
                `${report.current.legacy} registro(s) de itens antigos usam a classificação do catálogo atual. `}
              {report.current.unknown > 0 &&
                `${report.current.unknown} item(ns) sem classificação ficam disponíveis no filtro correspondente. `}
              {report.unclassifiedInPeriod > report.current.unknown &&
                `${report.unclassifiedInPeriod} registro(s) sem setor conhecido no período podem estar fora desta seleção; consulte o filtro Sem classificação. `}
              {report.current.missingItems > 0 &&
                `${report.current.missingItems} pedido(s) sem itens históricos entram na contagem, mas não nos valores de itens. `}
              A atualização SQL das análises preserva categoria e setor dos novos pedidos, mesmo se
              o catálogo mudar depois.
            </div>
          )}
          {report.current.total === 0 && (
            <p
              role="status"
              className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground"
            >
              Nenhum pedido encontrado neste período e seleção. Amplie as datas ou restaure os
              filtros para conferir o movimento.
            </p>
          )}
          <ReportOverview
            report={report}
            currency={currency}
            target={filters.targetMinutes}
            onDay={(day) => {
              setCustomStart(dayInput(day));
              setCustomEnd(dayInput(day));
              setPreset("custom");
            }}
          />
          <ReportProducts
            key={`products:${selectionKey}`}
            report={report}
            currency={currency}
            filename={filename}
          />
          <div className="flex justify-end">
            <button
              disabled={!ready || !report.current.rows.length}
              onClick={() =>
                downloadCsv(`${filename}-pedidos.csv`, orderCsv(report.current.rows, timezone))
              }
              className="rounded-xl border border-border px-4 py-2.5 text-xs disabled:opacity-40"
            >
              Exportar todos os pedidos desta seleção
            </button>
          </div>
          <ReportHistory
            key={`history:${selectionKey}`}
            report={report}
            currency={currency}
            timezone={timezone}
            filename={filename}
          />
        </>
      )}
    </div>
  );
}
