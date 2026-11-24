import { OnboardingChecklist } from "./platform-insights";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getErrorDetails } from "@/lib/errors";
import {
  restaurantDetail,
  PLAN_LABELS,
  formatPlatformDate,
  platformMoney,
  type PlatformDetail,
} from "./platform-api";
export function RestaurantManagementDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { user } = useAuth();
  const detail = useQuery({
    queryKey: ["platform-detail", user?.id, id],
    queryFn: () => restaurantDetail(id),
    gcTime: 0,
    retry: false,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{detail.data?.restaurant.name ?? "Restaurante"}</DialogTitle>
          <DialogDescription>Cadastro, operação, acesso e histórico de gestão.</DialogDescription>
        </DialogHeader>
        {detail.isPending ? (
          <p role="status" className="p-6">
            Carregando dados do restaurante…
          </p>
        ) : detail.isError ? (
          <div role="alert" className="p-6">
            <p>Não foi possível carregar os dados. Confira seu acesso e sua conexão.</p>
            <button className="mt-3 underline" onClick={() => void detail.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : (
          detail.data && (
            <DetailBody key={`${id}:${detail.data.entitlement.version}`} data={detail.data} />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
function DetailBody({ data }: { data: PlatformDetail }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const permissions = useQuery({
    queryKey: ["platform-owner", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_platform_owner");
      if (error) throw error;
      return data;
    },
  });
  const canEditAccess = !permissions.isError && permissions.data === true;
  const [action, setAction] = useState(
    data.entitlement.plan_type === "trial" ? "extend_trial" : "set_plan",
  );
  const [plan, setPlan] = useState(data.entitlement.plan_type);
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);
  const trial = action === "extend_trial" || (action === "set_plan" && plan === "trial");
  const save = useMutation({
    retry: false,
    mutationFn: async () => {
      const { data: result, error } = await supabase.rpc("platform_change_entitlement", {
        p_restaurant_id: data.restaurant.id,
        p_action: action,
        p_plan: action === "set_plan" ? plan : null,
        p_days: trial ? days : null,
        p_reason: reason.trim(),
        p_expected_version: data.entitlement.version,
      });
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      toast.success("Acesso atualizado e registrado no histórico");
      setReview(false);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["platform-detail"] });
      void qc.invalidateQueries({ queryKey: ["platform-restaurants"] });
      void qc.invalidateQueries({ queryKey: ["platform-growth"] });
      void qc.invalidateQueries({ queryKey: ["trial-status"] });
    },
    onError: (error) => {
      toast.error(getErrorDetails(error).message);
      setReview(false);
      void qc.invalidateQueries({ queryKey: ["platform-detail"] });
    },
  });
  const r = data.restaurant;
  const e = data.entitlement;
  const valid =
    reason.trim().length >= 5 &&
    reason.trim().length <= 500 &&
    (!trial || (Number.isInteger(days) && days >= 1 && days <= 365)) &&
    (action !== "extend_trial" || e.plan_type === "trial");
  const nextTrial = new Date(
    (action === "extend_trial"
      ? Math.max(Date.now(), new Date(e.trial_ends_at).getTime())
      : Date.now()) +
      (Number.isInteger(days) && days >= 1 && days <= 365 ? days : 0) * 86400000,
  ).toISOString();
  return (
    <div className="space-y-6">
      {data.health && <OnboardingChecklist health={data.health} />}
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-gold-soft px-3 py-1 text-xs text-primary">
          {PLAN_LABELS[e.plan_type] ?? e.plan_type}
        </span>
        <span className="rounded-full border border-border px-3 py-1 text-xs">
          {e.plan_source === "manual"
            ? "Acesso definido pela gestão"
            : "Acesso padrão / assinatura"}
        </span>
        <a
          href={`/m/${r.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-border px-3 py-1 text-xs underline"
        >
          Ver cardápio ↗
        </a>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-border p-4">
          <h3 className="font-medium">Responsável e cadastro</h3>
          <dl className="mt-3 space-y-2 text-sm">
            {[
              ["Nome", data.owner.name ?? "Não informado"],
              ["E-mail", data.owner.email ?? "Não informado"],
              ["Telefone", data.owner.phone ?? "Não informado"],
              ["Restaurante criado", formatPlatformDate(r.created_at)],
              ["Conta criada", formatPlatformDate(data.owner.created_at)],
              ["Último acesso", formatPlatformDate(data.owner.last_sign_in_at)],
              ["Endereço", `/m/${r.slug}`],
              ["Fuso / moeda", `${r.timezone} · ${r.currency}`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="rounded-2xl border border-border p-4">
          <h3 className="font-medium">Operação do restaurante</h3>
          <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
            {[
              ["Produtos", data.counts.products],
              ["Disponíveis", data.counts.available_products],
              ["Categorias", data.counts.categories],
              ["Mesas", data.counts.tables],
              ["Equipe ativa", data.counts.staff],
              ["Pedidos totais", data.orders.total],
              ["Em aberto", data.orders.open],
              ["Cancelados", data.orders.cancelled],
              ["Entregues", data.orders.delivered],
              ["Vendas entregues", platformMoney(data.orders.sales, r.currency)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Último pedido: {formatPlatformDate(data.orders.last_at)}. Totais de todo o histórico.
            Vendas do restaurante não são receita do Flux nem confirmação de pagamento.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Agenda semanal: {r.operating_hours ? "configurada" : "não configurada"} · Proteção das
            mesas: {r.require_table_code ? "ligada" : "desligada"} · Cozinha:{" "}
            {r.kitchen_open ? "habilitada" : "pausada"} · Bar:{" "}
            {r.bar_open === false ? "pausado" : "habilitado"}
          </p>
        </section>
      </div>
      <section className="space-y-4 rounded-2xl border border-primary/30 bg-gold-soft/30 p-4 md:p-5">
        <div>
          <p className="text-xs uppercase tracking-widest text-primary">Controle de acesso</p>
          <h3 className="mt-1 text-lg font-medium">Plano e período de teste</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Trial atual: {formatPlatformDate(e.trial_ends_at)}
            {e.plan_type !== "trial" ? " (não se aplica ao plano atual)" : ""}. As alterações valem
            para a conta do responsável e seus {data.counts.restaurants} restaurante(s).
          </p>
        </div>
        <p className="rounded-xl border border-border bg-background/50 p-3 text-xs">
          Alterar o acesso não cria cobrança nem cancela uma assinatura. Assinaturas existentes
          continuam sendo cobradas pelo provedor até serem ajustadas lá. Um acesso manual prevalece
          sobre atualizações da cobrança até vocês restaurarem o acesso padrão.
        </p>
        {canEditAccess ? (
          <fieldset disabled={save.isPending} className="space-y-4">
            {action === "restore_billing" && data.owner.billing_plan === "trial" && (
              <p className="rounded-xl border border-border bg-background p-3 text-sm">
                O trial padrão termina em {formatPlatformDate(data.owner.billing_trial_ends_at)}.
                {new Date(data.owner.billing_trial_ends_at).getTime() < Date.now()
                  ? " Esse prazo já venceu; restaurar o padrão encerrará o acesso aos recursos de teste."
                  : " Ao restaurar, esse será o prazo de acesso."}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                Ação
                <select
                  value={action}
                  onChange={(event) => {
                    setAction(event.target.value);
                    setReview(false);
                  }}
                  className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground"
                >
                  <option value="extend_trial" disabled={e.plan_type !== "trial"}>
                    Adicionar dias ao trial
                  </option>
                  <option value="set_plan">Definir plano de acesso</option>
                  <option value="restore_billing">Restaurar acesso padrão / assinatura</option>
                </select>
              </label>
              {action === "set_plan" && (
                <label className="text-xs text-muted-foreground">
                  Novo plano
                  <select
                    value={plan}
                    onChange={(event) => {
                      setPlan(event.target.value);
                      setReview(false);
                    }}
                    className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground"
                  >
                    {Object.entries(PLAN_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {trial && (
                <label className="text-xs text-muted-foreground">
                  Dias (1 a 365)
                  <input
                    type="number"
                    min={1}
                    max={365}
                    step={1}
                    value={Number.isNaN(days) ? "" : days}
                    onChange={(event) => {
                      setDays(Number(event.target.value));
                      setReview(false);
                    }}
                    className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground"
                  />
                </label>
              )}
            </div>
            {action === "extend_trial" && e.plan_type !== "trial" && (
              <p className="text-sm text-amber-400">
                Este cliente já tem plano. Para oferecer um teste, escolha Definir plano de acesso →
                Trial.
              </p>
            )}
            <label className="block text-xs text-muted-foreground">
              Motivo da alteração
              <textarea
                value={reason}
                maxLength={500}
                onChange={(event) => {
                  setReason(event.target.value);
                  setReview(false);
                }}
                placeholder="Ex.: mais 14 dias para concluir a implantação do cardápio"
                className="mt-1 min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground"
              />
            </label>
            {review ? (
              <div
                className="space-y-3 rounded-xl border border-primary/40 bg-background p-4"
                role="status"
              >
                <p className="text-sm font-medium">Confirmar alteração para {r.name}?</p>
                <p className="text-sm text-muted-foreground">
                  {action === "restore_billing"
                    ? `Restaurar ${PLAN_LABELS[data.owner.billing_plan] ?? data.owner.billing_plan}, conforme o cadastro / assinatura atual.`
                    : trial
                      ? `Acesso Trial até aproximadamente ${formatPlatformDate(nextTrial)}. O banco confirma o prazo ao salvar.`
                      : `Conceder acesso ${PLAN_LABELS[plan]}.`}
                </p>
                <p className="break-words text-xs">Motivo: {reason.trim()}</p>
                <p className="text-xs text-muted-foreground">Responsável: {user?.email}</p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => save.mutate()}
                    className="rounded-xl bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                  >
                    {save.isPending ? "Salvando…" : "Confirmar alteração"}
                  </button>
                  <button
                    onClick={() => setReview(false)}
                    className="rounded-xl border border-border px-4 py-2.5 text-sm"
                  >
                    Voltar
                  </button>
                </div>
              </div>
            ) : (
              <button
                disabled={!valid}
                onClick={() => setReview(true)}
                className="rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
              >
                Revisar alteração
              </button>
            )}
          </fieldset>
        ) : (
          <p className="text-sm text-muted-foreground">
            Alterações de plano e de prazo de teste são restritas ao proprietário do Flux.
          </p>
        )}
      </section>
      <section className="rounded-2xl border border-border p-4">
        <h3 className="font-medium">Assinaturas registradas</h3>
        {data.subscriptions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nenhuma assinatura registrada. Plano base:{" "}
            {PLAN_LABELS[data.owner.billing_plan] ?? data.owner.billing_plan}.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.subscriptions.map((s) => (
              <li
                key={s.stripe_subscription_id}
                className="rounded-xl bg-background/60 p-3 text-sm"
              >
                <p>
                  {PLAN_LABELS[s.plan_type ?? ""] ?? "Plano não identificado"} · {s.status} ·{" "}
                  {s.environment === "live" ? "Produção" : "Teste"}
                </p>
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  {s.stripe_subscription_id} · Período até{" "}
                  {formatPlatformDate(s.current_period_end)}
                  {s.cancel_at_period_end ? " · cancelamento agendado" : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="font-medium">Histórico de alterações</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Até as últimas 50 alterações desta conta.
        </p>
        {data.audit.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma alteração administrativa registrada.
          </p>
        ) : (
          <ol className="mt-4 space-y-3">
            {data.audit.map((a) => (
              <li key={a.id} className="rounded-xl border border-border p-4">
                <p className="text-sm font-medium">
                  {a.action === "extend_trial"
                    ? "Trial estendido"
                    : a.action === "restore_billing"
                      ? "Acesso padrão restaurado"
                      : "Plano alterado"}
                </p>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {formatPlatformDate(a.created_at)} · {a.actor_email}
                </p>
                <p className="mt-2 break-words text-sm">{a.reason}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {PLAN_LABELS[a.before_state.plan_type]} → {PLAN_LABELS[a.after_state.plan_type]} ·{" "}
                  {a.after_state.plan_source === "manual"
                    ? "Definido pela gestão"
                    : "Padrão / assinatura"}
                  {a.after_state.plan_type === "trial"
                    ? ` · até ${formatPlatformDate(a.after_state.trial_ends_at)}`
                    : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
