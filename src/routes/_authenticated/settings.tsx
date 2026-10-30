import { PaymentTestModeBanner } from "@/components/payments/payment-test-mode-banner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/use-auth";
import { daysLeft, useTrialStatus } from "@/features/billing/trial-status";
import { EstablishmentSection } from "@/features/restaurant/establishment-section";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { TeamSection } from "@/features/staff/team-section";
import { useStripeCheckout } from "@/hooks/use-stripe-checkout";
import { supabase } from "@/integrations/supabase/client";
import { getErrorDetails } from "@/lib/errors";
import { createPortalSession, updateSubscriptionPlan } from "@/lib/payments.functions";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  ChefHat,
  Crown,
  ExternalLink,
  Loader2,
  Rocket,
  Sparkles,
  Store,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (search: Record<string, unknown>): { tab?: string; plan?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    plan: typeof search.plan === "string" ? search.plan : undefined,
  }),
  head: () => ({ meta: [{ title: "Configurações — Flux Menu" }] }),
  component: SettingsPage,
});

type PlanId = "basic" | "essential" | "pro" | "enterprise";

const PLANS: {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  icon: typeof Sparkles;
  description: string;
  features: string[];
  priceId?: string;
  comingSoon?: boolean;
  featured?: boolean;
}[] = [
  {
    id: "basic",
    name: "Basic",
    price: "R$ 30",
    period: "/mês",
    icon: Sparkles,
    description: "Cardápio digital com QR Code, sem pedidos.",
    features: ["Cardápio digital ilimitado", "QR Code para o salão", "Atualizações em tempo real"],
    priceId: "basic_monthly",
  },
  {
    id: "essential",
    name: "Essential",
    price: "R$ 99",
    period: "/mês",
    icon: Crown,
    description: "Operação digital completa para começar.",
    features: [
      "Pedidos por QR Code",
      "KDS para cozinha e bar",
      "Até 5 QR Codes",
      "Suporte por email",
    ],
    priceId: "essential_monthly",
  },
  {
    id: "pro",
    name: "Pro",
    price: "R$ 199",
    period: "/mês",
    icon: Crown,
    description: "Gestão total com modo garçom e análises.",
    features: [
      "QR Codes ilimitados",
      "Modo Garçom + alertas sonoros",
      "Análises de pico e relatórios",
      "Bar e Cozinha separados",
      "Suporte prioritário",
    ],
    priceId: "pro_monthly",
    featured: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Sob consulta",
    period: "",
    icon: Rocket,
    description: "Multi-unidades e integrações sob medida.",
    features: [
      "Multi-unidade & franquias",
      "Integrações personalizadas",
      "SLA dedicado",
      "Onboarding presencial",
    ],
    comingSoon: true,
  },
];

function SettingsPage() {
  const { tab, plan: planParam } = Route.useSearch();
  const { data: restaurant, isLoading, isError, error } = useRestaurant();
  const { data: trialInfo } = useTrialStatus();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [kitchenOpen, setKitchenOpen] = useState(true);
  const { openCheckout, closeCheckout, isOpen, checkoutElement } = useStripeCheckout();
  const paymentsReady = isPaymentsConfigured();
  const [justUpgraded, setJustUpgraded] = useState<string | null>(null);

  // Load current active subscription (if any)
  const { data: subscription } = useQuery({
    queryKey: ["subscription", user?.id],
    enabled: !!user?.id && paymentsReady,
    refetchInterval: 5000,
    queryFn: async () => {
      const env = paymentsReady ? getStripeEnvironment() : "sandbox";
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user!.id)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (restaurant) setKitchenOpen(restaurant.kitchen_open ?? true);
  }, [restaurant]);

  // Realtime: detecta transição trial → plano pago e mostra banner + toast
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`profile-plan-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload) => {
          const prevPlan = payload.old?.plan_type;
          const newPlan = payload.new?.plan_type;
          if (newPlan && newPlan !== prevPlan && newPlan !== "trial") {
            const label = newPlan.charAt(0).toUpperCase() + newPlan.slice(1);
            setJustUpgraded(label);
            toast.success(`Parabéns! Plano ${label} ativo`, {
              description: "Seus recursos foram liberados.",
            });
            qc.invalidateQueries({ queryKey: ["trial-status"] });
            qc.invalidateQueries({ queryKey: ["subscription"] });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  // Auto-open embedded checkout if user arrives with ?plan=basic|essential|pro
  useEffect(() => {
    if (!user) return;
    const pending =
      planParam ??
      (typeof window !== "undefined" ? sessionStorage.getItem("flux:pending_plan") : null);
    if (!pending) return;
    const found = PLANS.find((p) => p.id === pending);
    if (!found?.priceId) return;
    if (typeof window !== "undefined") sessionStorage.removeItem("flux:pending_plan");
    if (!paymentsReady) {
      toast.error("Pagamentos não configurados");
      return;
    }
    openCheckout({
      priceId: found.priceId,
      returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planParam, user?.id, paymentsReady]);

  const update = useMutation({
    mutationFn: async (patch: { kitchen_open?: boolean }) => {
      const { error } = await supabase.from("restaurants").update(patch).eq("id", restaurant!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["restaurant"] }),
  });

  async function toggleKitchen(v: boolean) {
    setKitchenOpen(v);
    try {
      await update.mutateAsync({ kitchen_open: v });
      toast.success(v ? "Cozinha aberta" : "Cozinha encerrada — apenas bebidas disponíveis");
    } catch (caught: unknown) {
      const e = getErrorDetails(caught);
      setKitchenOpen(!v);
      toast.error(e.message ?? "Erro ao salvar");
    }
  }

  function handleSubscribe(plan: (typeof PLANS)[number]) {
    if (!plan.priceId) return;
    if (!paymentsReady) {
      toast.error("Pagamentos não configurados");
      return;
    }
    openCheckout({
      priceId: plan.priceId,
      returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    });
  }

  // Swap the price of the existing subscription (proration) when the user
  // already has an active sub and clicks a different plan card.
  const swapPlan = useMutation({
    mutationFn: async (newPriceId: string) => {
      const result = await updateSubscriptionPlan({
        data: { newPriceId, environment: getStripeEnvironment() },
      });
      if ("error" in result) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success("Plano atualizado! Atualizando seu acesso…");
      qc.invalidateQueries({ queryKey: ["subscription"] });
      qc.invalidateQueries({ queryKey: ["trial-status"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao trocar de plano"),
  });

  async function handleManageBilling() {
    try {
      const result = await createPortalSession({
        data: { environment: getStripeEnvironment(), returnUrl: window.location.href },
      });
      if ("error" in result) throw new Error(result.error);
      window.open(result.url, "_blank");
    } catch (caught: unknown) {
      const e = getErrorDetails(caught);
      toast.error(e.message ?? "Erro ao abrir portal de assinatura");
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !restaurant) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
          <Store className="h-5 w-5 text-primary" />
        </div>
        <p className="mt-4 text-sm font-medium">Nenhum item encontrado</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {isError
            ? (error as Error).message
            : "Configure seu restaurante para liberar as configurações."}
        </p>
        {!isError && (
          <button
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Recarregar
          </button>
        )}
      </div>
    );
  }

  const profilePlan = trialInfo?.plan_type ?? "trial";
  const trialDays = daysLeft(trialInfo);
  const isTrial = profilePlan === "trial";

  // Resolve current paid plan from active subscription (price_id) → fallback to profile plan_type.
  const currentPlanId: PlanId | null = (() => {
    if (subscription?.price_id) {
      const found = PLANS.find((p) => p.priceId === subscription.price_id);
      if (found) return found.id;
    }
    if (profilePlan && profilePlan !== "trial") return profilePlan as PlanId;
    return null;
  })();
  const effectivePlanName = isTrial
    ? "Trial"
    : (PLANS.find((p) => p.id === currentPlanId)?.name ?? profilePlan);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-primary">Configurações</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">
          Centro de <span className="text-gradient-gold italic">controle</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Operação, identidade e assinatura em um só lugar.
        </p>
      </div>

      <Tabs
        key={tab ?? (planParam ? "billing" : "operation")}
        defaultValue={tab ?? (planParam ? "billing" : "operation")}
        className="w-full"
      >
        <TabsList className="bg-surface">
          <TabsTrigger value="operation">Operação</TabsTrigger>
          <TabsTrigger value="establishment">Estabelecimento</TabsTrigger>
          <TabsTrigger value="team">Equipe</TabsTrigger>
          <TabsTrigger value="billing">Assinatura</TabsTrigger>
        </TabsList>

        <TabsContent value="operation" className="mt-6 space-y-6">
          <section className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
                  <ChefHat className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-xl tracking-tight">Cozinha</h2>
                  <p className="mt-1 max-w-md text-xs text-muted-foreground">
                    Quando fechada, itens de comida são automaticamente desabilitados no cardápio
                    público. Apenas bebidas continuam disponíveis para pedido.
                  </p>
                  <p className="mt-3 text-sm">
                    Status:{" "}
                    <span
                      className={
                        kitchenOpen
                          ? "font-medium text-emerald-400"
                          : "font-medium text-[oklch(0.78_0.18_25)]"
                      }
                    >
                      {kitchenOpen ? "Aberta" : "Fechada"}
                    </span>
                  </p>
                </div>
              </div>
              <Switch
                checked={kitchenOpen}
                onCheckedChange={toggleKitchen}
                disabled={update.isPending}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-xl tracking-tight">Tutorial guiado</h2>
                  <p className="mt-1 max-w-md text-xs text-muted-foreground">
                    Reveja o tour de boas-vindas com as principais áreas do Flux Menu: cardápio, QR
                    Codes, análises e operação.
                  </p>
                </div>
              </div>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("flux:start-tour"))}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                Ver tutorial
              </button>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="establishment" className="mt-6">
          <EstablishmentSection
            restaurantId={restaurant.id}
            initialName={restaurant.name}
            slug={restaurant.slug}
            currency={restaurant.currency}
            timezone={restaurant.timezone}
            initialLogoUrl={restaurant.logo_url ?? null}
            initialBrandColor={restaurant.brand_color ?? null}
            initialBrandTextColor={restaurant.brand_text_color ?? null}
            initialBrandAccentColor={restaurant.brand_accent_color ?? null}
            initialBrandCardColor={restaurant.brand_card_color ?? null}
            initialBrandHeaderColor={restaurant.brand_header_color ?? null}
            initialBrandButtonColor={restaurant.brand_button_color ?? null}
            initialBanner={{
              enabled: restaurant.banner_enabled ?? false,
              title: restaurant.banner_title ?? "",
              description: restaurant.banner_description ?? "",
              image_url: restaurant.banner_image_url ?? null,
              cta_label: restaurant.banner_cta_label ?? "",
            }}
          />
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <TeamSection restaurantId={restaurant.id} slug={restaurant.slug} />
        </TabsContent>

        <TabsContent value="billing" className="mt-6 space-y-6">
          <PaymentTestModeBanner />

          {justUpgraded && (
            <div className="flex items-start justify-between gap-3 rounded-2xl border border-[oklch(0.78_0.13_84_/_0.5)] bg-gold-soft px-5 py-4 animate-fade-up">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="font-display text-base tracking-tight text-foreground">
                    🎉 Parabéns! Seu plano <strong>{justUpgraded}</strong> já está ativo.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Seus recursos foram liberados — pode usar à vontade.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setJustUpgraded(null)}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
          )}

          {/* Past-due / unpaid banner — access already revoked by webhook. */}
          {subscription &&
            (subscription.status === "past_due" || subscription.status === "unpaid") && (
              <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Pagamento em atraso — acesso bloqueado
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Atualize seu método de pagamento para reativar seu plano imediatamente.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleManageBilling}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
                >
                  Atualizar pagamento <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            )}

          {/* Cancelamento agendado — usuário cancelou mas ainda tem período pago. */}
          {subscription?.cancel_at_period_end &&
            subscription.current_period_end &&
            subscription.status === "active" && (
              <div className="flex items-start justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Cancelamento agendado</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Você terá acesso ao plano até{" "}
                      <strong>
                        {new Date(subscription.current_period_end as string).toLocaleDateString(
                          "pt-BR",
                        )}
                      </strong>
                      . Reative no portal a qualquer momento.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleManageBilling}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
                >
                  Reativar
                </button>
              </div>
            )}

          <section className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Plano atual
                </p>
                <h2 className="mt-1 font-display text-2xl tracking-tight">{effectivePlanName}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isTrial
                    ? `Período de teste — ${trialDays} ${trialDays === 1 ? "dia restante" : "dias restantes"}.`
                    : subscription?.cancel_at_period_end && subscription.current_period_end
                      ? `Acesso até ${new Date(subscription.current_period_end as string).toLocaleDateString("pt-BR")}.`
                      : subscription?.current_period_end
                        ? `Próxima cobrança em ${new Date(subscription.current_period_end as string).toLocaleDateString("pt-BR")}.`
                        : "Faturamento mensal recorrente."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-wider ring-1",
                    subscription?.status === "past_due" || subscription?.status === "unpaid"
                      ? "bg-red-500/10 text-red-400 ring-red-500/30"
                      : "bg-gold-soft text-primary ring-[oklch(0.78_0.13_84_/_0.3)]",
                  )}
                >
                  <Check className="h-3 w-3" />
                  {subscription?.status === "past_due" || subscription?.status === "unpaid"
                    ? "Bloqueado"
                    : "Ativo"}
                </span>
                {subscription?.stripe_customer_id && (
                  <button
                    onClick={handleManageBilling}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
                  >
                    Gerenciar assinatura <ExternalLink className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </section>

          {isTrial && (
            <div className="flex items-start gap-3 rounded-2xl border border-[oklch(0.78_0.13_84_/_0.3)] bg-gold-soft px-5 py-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm text-foreground">
                Você está no plano <strong className="font-semibold">Trial</strong>. Faça o upgrade
                para liberar todas as funções.
              </p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => {
              const Icon = plan.icon;
              const isCurrent = !isTrial && plan.id === currentPlanId;
              // User has an active paid subscription on a different plan → swap (proration).
              const hasActiveSub =
                !!subscription &&
                (subscription.status === "active" || subscription.status === "trialing") &&
                !!currentPlanId;
              const canSwap = hasActiveSub && !isCurrent && !!plan.priceId && !plan.comingSoon;
              const disabled = plan.comingSoon || isCurrent || swapPlan.isPending;

              const handleClick = () => {
                if (canSwap && plan.priceId) {
                  if (
                    confirm(
                      `Trocar para o plano ${plan.name}? A diferença será cobrada proporcionalmente.`,
                    )
                  ) {
                    swapPlan.mutate(plan.priceId);
                  }
                } else {
                  handleSubscribe(plan);
                }
              };

              const buttonLabel = isCurrent
                ? "Plano atual"
                : plan.comingSoon
                  ? "Em breve"
                  : canSwap
                    ? "Trocar para este plano"
                    : "Assinar agora";

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col rounded-2xl border bg-surface p-6 transition",
                    plan.featured
                      ? "border-[oklch(0.78_0.13_84_/_0.5)] shadow-[0_0_40px_-12px_oklch(0.78_0.13_84_/_0.4)]"
                      : plan.comingSoon
                        ? "border-dashed border-border"
                        : "border-border",
                  )}
                >
                  {plan.featured && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                      Mais vendido
                    </span>
                  )}
                  {plan.comingSoon && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-border bg-background px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Em breve
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <h3 className="font-display text-lg tracking-tight">{plan.name}</h3>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="font-display text-3xl tracking-tight">{plan.price}</span>
                    {plan.period && (
                      <span className="text-xs text-muted-foreground">{plan.period}</span>
                    )}
                  </div>
                  <ul className="mt-5 flex-1 space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={handleClick}
                    disabled={disabled}
                    className={cn(
                      "mt-6 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition",
                      disabled
                        ? "cursor-not-allowed bg-muted text-muted-foreground"
                        : plan.featured
                          ? "bg-primary text-primary-foreground hover:opacity-90"
                          : "border border-border bg-background hover:bg-accent",
                    )}
                  >
                    {swapPlan.isPending && canSwap ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      buttonLabel
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            Pagamentos processados de forma segura. Você pode cancelar ou trocar de plano a qualquer
            momento.
          </p>
        </TabsContent>
      </Tabs>

      <Dialog open={isOpen} onOpenChange={(o) => !o && closeCheckout()}>
        <DialogContent className="max-w-2xl p-0 sm:max-w-3xl">
          <DialogHeader className="border-b border-border p-4">
            <DialogTitle className="font-display text-lg tracking-tight">
              Finalizar assinatura
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-y-auto p-2">{checkoutElement}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
