import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  ChefHat,
  Store,
  Check,
  Sparkles,
  Crown,
  Rocket,
  AlertTriangle,
  Users,
  Plus,
  Trash2,
  Save,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { useTrialStatus, daysLeft } from "@/features/billing/trial-guard";
import {
  useStaff,
  useCreateStaff,
  useUpdateStaff,
  useDeleteStaff,
  type StaffMember,
} from "@/features/staff/staff-queries";
import { useAuth } from "@/features/auth/auth-provider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStripeCheckout } from "@/hooks/use-stripe-checkout";
import { createPortalSession, updateSubscriptionPlan } from "@/lib/payments.functions";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";
import { PaymentTestModeBanner } from "@/components/payments/payment-test-mode-banner";
import { cn } from "@/lib/utils";

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
    if (restaurant) setKitchenOpen((restaurant as any).kitchen_open ?? true);
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
          const prevPlan = (payload.old as any)?.plan_type;
          const newPlan = (payload.new as any)?.plan_type;
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
      customerEmail: user.email ?? undefined,
      userId: user.id,
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
    } catch (e: any) {
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
      customerEmail: user?.email ?? undefined,
      userId: user?.id ?? "",
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
    onError: (e: any) => toast.error(e.message ?? "Erro ao trocar de plano"),
  });

  async function handleManageBilling() {
    try {
      const result = await createPortalSession({
        data: { environment: getStripeEnvironment(), returnUrl: window.location.href },
      });
      if ("error" in result) throw new Error(result.error);
      window.open(result.url, "_blank");
    } catch (e: any) {
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
            initialLogoUrl={(restaurant as any).logo_url ?? null}
            initialBrandColor={(restaurant as any).brand_color ?? null}
            initialBrandTextColor={(restaurant as any).brand_text_color ?? null}
            initialBrandAccentColor={(restaurant as any).brand_accent_color ?? null}
            initialBrandCardColor={(restaurant as any).brand_card_color ?? null}
            initialBrandHeaderColor={(restaurant as any).brand_header_color ?? null}
            initialBrandButtonColor={(restaurant as any).brand_button_color ?? null}
            initialBanner={{
              enabled: (restaurant as any).banner_enabled ?? false,
              title: (restaurant as any).banner_title ?? "",
              description: (restaurant as any).banner_description ?? "",
              image_url: (restaurant as any).banner_image_url ?? null,
              cta_label: (restaurant as any).banner_cta_label ?? "",
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

function EstablishmentSection({
  restaurantId,
  initialName,
  slug,
  currency,
  timezone,
  initialLogoUrl,
  initialBrandColor,
  initialBrandTextColor,
  initialBrandAccentColor,
  initialBrandCardColor,
  initialBrandHeaderColor,
  initialBrandButtonColor,
  initialBanner,
}: {
  restaurantId: string;
  initialName: string;
  slug: string;
  currency: string;
  timezone: string;
  initialLogoUrl: string | null;
  initialBrandColor: string | null;
  initialBrandTextColor: string | null;
  initialBrandAccentColor: string | null;
  initialBrandCardColor: string | null;
  initialBrandHeaderColor: string | null;
  initialBrandButtonColor: string | null;
  initialBanner: {
    enabled: boolean;
    title: string;
    description: string;
    image_url: string | null;
    cta_label: string;
  };
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [name, setName] = useState(initialName);
  const [selectedTimezone, setSelectedTimezone] = useState(timezone);
  useEffect(() => setSelectedTimezone(timezone), [timezone]);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [uploading, setUploading] = useState(false);
  const DEFAULT_BG = "#0b0b0c";
  const DEFAULT_TEXT = "#f5f5f4";
  const DEFAULT_ACCENT = "#d4a017";
  const DEFAULT_CARD = "#171716";
  const DEFAULT_HEADER = "#0b0b0c";
  const DEFAULT_BUTTON = "#d4a017";
  const [brandColor, setBrandColor] = useState<string>(initialBrandColor || DEFAULT_BG);
  const [brandTextColor, setBrandTextColor] = useState<string>(
    initialBrandTextColor || DEFAULT_TEXT,
  );
  const [brandAccentColor, setBrandAccentColor] = useState<string>(
    initialBrandAccentColor || DEFAULT_ACCENT,
  );
  const [brandCardColor, setBrandCardColor] = useState<string>(
    initialBrandCardColor || DEFAULT_CARD,
  );
  const [brandHeaderColor, setBrandHeaderColor] = useState<string>(
    initialBrandHeaderColor || DEFAULT_HEADER,
  );
  const [brandButtonColor, setBrandButtonColor] = useState<string>(
    initialBrandButtonColor || DEFAULT_BUTTON,
  );
  const [savingColor, setSavingColor] = useState(false);

  // Banner state
  const [bannerEnabled, setBannerEnabled] = useState(initialBanner.enabled);
  const [bannerTitle, setBannerTitle] = useState(initialBanner.title || "");
  const [bannerDescription, setBannerDescription] = useState(initialBanner.description || "");
  const [bannerImageUrl, setBannerImageUrl] = useState<string | null>(initialBanner.image_url);
  const [bannerCtaLabel, setBannerCtaLabel] = useState(initialBanner.cta_label || "");
  const [bannerUploading, setBannerUploading] = useState(false);
  const [savingBanner, setSavingBanner] = useState(false);

  useEffect(() => setName(initialName), [initialName]);
  useEffect(() => setLogoUrl(initialLogoUrl), [initialLogoUrl]);
  useEffect(() => setBrandColor(initialBrandColor || DEFAULT_BG), [initialBrandColor]);
  useEffect(
    () => setBrandTextColor(initialBrandTextColor || DEFAULT_TEXT),
    [initialBrandTextColor],
  );
  useEffect(
    () => setBrandAccentColor(initialBrandAccentColor || DEFAULT_ACCENT),
    [initialBrandAccentColor],
  );
  useEffect(
    () => setBrandCardColor(initialBrandCardColor || DEFAULT_CARD),
    [initialBrandCardColor],
  );
  useEffect(
    () => setBrandHeaderColor(initialBrandHeaderColor || DEFAULT_HEADER),
    [initialBrandHeaderColor],
  );
  useEffect(
    () => setBrandButtonColor(initialBrandButtonColor || DEFAULT_BUTTON),
    [initialBrandButtonColor],
  );

  const colorsDirty =
    brandColor !== (initialBrandColor || DEFAULT_BG) ||
    brandTextColor !== (initialBrandTextColor || DEFAULT_TEXT) ||
    brandAccentColor !== (initialBrandAccentColor || DEFAULT_ACCENT) ||
    brandCardColor !== (initialBrandCardColor || DEFAULT_CARD) ||
    brandHeaderColor !== (initialBrandHeaderColor || DEFAULT_HEADER) ||
    brandButtonColor !== (initialBrandButtonColor || DEFAULT_BUTTON);

  const saveBrandColor = async (overrides?: Partial<Record<string, string>>) => {
    setSavingColor(true);
    try {
      const payload: any = {
        brand_color: overrides?.brand_color ?? brandColor,
        brand_text_color: overrides?.brand_text_color ?? brandTextColor,
        brand_accent_color: overrides?.brand_accent_color ?? brandAccentColor,
        brand_card_color: overrides?.brand_card_color ?? brandCardColor,
        brand_header_color: overrides?.brand_header_color ?? brandHeaderColor,
        brand_button_color: overrides?.brand_button_color ?? brandButtonColor,
      };
      const { error } = await supabase.from("restaurants").update(payload).eq("id", restaurantId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["restaurant"] });
      qc.invalidateQueries({ queryKey: ["public-menu"] });
      toast.success("Cores da marca atualizadas");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar cores");
    } finally {
      setSavingColor(false);
    }
  };

  const resetBrandColors = async () => {
    setBrandColor(DEFAULT_BG);
    setBrandTextColor(DEFAULT_TEXT);
    setBrandAccentColor(DEFAULT_ACCENT);
    setBrandCardColor(DEFAULT_CARD);
    setBrandHeaderColor(DEFAULT_HEADER);
    setBrandButtonColor(DEFAULT_BUTTON);
    await saveBrandColor({
      brand_color: DEFAULT_BG,
      brand_text_color: DEFAULT_TEXT,
      brand_accent_color: DEFAULT_ACCENT,
      brand_card_color: DEFAULT_CARD,
      brand_header_color: DEFAULT_HEADER,
      brand_button_color: DEFAULT_BUTTON,
    });
  };

  const uploadBannerImage = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 5MB)");
      return;
    }
    setBannerUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${restaurantId}/banner-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("menu-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
      setBannerImageUrl(data.publicUrl);
      toast.success("Imagem do banner enviada");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao enviar imagem");
    } finally {
      setBannerUploading(false);
    }
  };

  const saveBanner = async () => {
    setSavingBanner(true);
    try {
      const { error } = await supabase
        .from("restaurants")
        .update({
          banner_enabled: bannerEnabled,
          banner_title: bannerTitle || null,
          banner_description: bannerDescription || null,
          banner_image_url: bannerImageUrl,
          banner_cta_label: bannerCtaLabel || null,
        } as any)
        .eq("id", restaurantId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["restaurant"] });
      qc.invalidateQueries({ queryKey: ["public-menu"] });
      toast.success("Banner promocional salvo");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar banner");
    } finally {
      setSavingBanner(false);
    }
  };

  const uploadLogo = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 5MB)");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${restaurantId}/logo-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("menu-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
      const url = data.publicUrl;
      const { error: dbErr } = await supabase
        .from("restaurants")
        .update({ logo_url: url })
        .eq("id", restaurantId);
      if (dbErr) throw dbErr;
      setLogoUrl(url);
      qc.invalidateQueries({ queryKey: ["restaurant"] });
      qc.invalidateQueries({ queryKey: ["public-menu"] });
      toast.success("Logo atualizado");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = async () => {
    const { error } = await supabase
      .from("restaurants")
      .update({ logo_url: null })
      .eq("id", restaurantId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLogoUrl(null);
    qc.invalidateQueries({ queryKey: ["restaurant"] });
    qc.invalidateQueries({ queryKey: ["public-menu"] });
    toast.success("Logo removido");
  };

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Informe um nome");
      new Intl.DateTimeFormat("pt-BR", { timeZone: selectedTimezone }).format();
      const { error } = await supabase
        .from("restaurants")
        .update({ name: trimmed, timezone: selectedTimezone })
        .eq("id", restaurantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["restaurant"] });
      qc.invalidateQueries({ queryKey: ["public-menu"] });
      toast.success("Estabelecimento atualizado");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });

  const dirty = name.trim() !== initialName.trim() || selectedTimezone !== timezone;
  const initials = (initialName || "R").slice(0, 2).toUpperCase();

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
          <Store className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl tracking-tight">Estabelecimento</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Este nome e logo aparecem no Dashboard, na navegação e no cardápio público do cliente.
          </p>

          <div className="mt-5 flex flex-col items-start gap-4 rounded-xl border border-border bg-background/40 p-4 sm:flex-row sm:items-center">
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo do estabelecimento"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-display text-xl text-primary">{initials}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Foto de perfil / Logo</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Aparece no topo do cardápio público. PNG, JPG ou WEBP (máx 5MB).
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium transition hover:border-[oklch(0.78_0.13_84_/_0.5)]">
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Store className="h-3.5 w-3.5" />
                  )}
                  {logoUrl ? "Trocar imagem" : "Enviar imagem"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadLogo(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground transition hover:text-foreground"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Nome do estabelecimento
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-[oklch(0.78_0.13_84_/_0.5)]"
                  placeholder="Ex.: Trattoria Bella"
                />
                <button
                  onClick={() => save.mutate()}
                  disabled={!dirty || save.isPending}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                >
                  {save.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salvar
                </button>
              </div>
            </div>
            <dl className="grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Slug</dt>
                <dd className="mt-1 truncate text-sm">/m/{slug}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Moeda
                </dt>
                <dd className="mt-1 text-sm">{currency}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Fuso</dt>
                <dd className="mt-1">
                  <select
                    aria-label="Fuso horário do restaurante"
                    value={selectedTimezone}
                    onChange={(e) => setSelectedTimezone(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background p-2 text-sm"
                  >
                    {Array.from(
                      new Set([
                        timezone,
                        "America/Sao_Paulo",
                        "America/Manaus",
                        "America/Cuiaba",
                        "America/Rio_Branco",
                        "America/Noronha",
                        "Europe/Lisbon",
                        "UTC",
                      ]),
                    ).map((zone) => (
                      <option key={zone} value={zone}>
                        {zone}
                      </option>
                    ))}
                  </select>
                </dd>
              </div>
            </dl>

            <div className="rounded-xl border border-border bg-background/40 p-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">Cores da marca</p>
                <p className="text-xs text-muted-foreground">
                  Personalize seu cardápio público com a identidade visual do seu estabelecimento.
                  Disponível em todos os planos.
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  {
                    label: "Principal (fundo)",
                    hint: "Cor de fundo do cardápio",
                    value: brandColor,
                    set: setBrandColor,
                  },
                  {
                    label: "Secundária (texto)",
                    hint: "Cor das letras",
                    value: brandTextColor,
                    set: setBrandTextColor,
                  },
                  {
                    label: "Destaque",
                    hint: "Preços e detalhes",
                    value: brandAccentColor,
                    set: setBrandAccentColor,
                  },
                  {
                    label: "Cabeçalho",
                    hint: "Topo do cardápio",
                    value: brandHeaderColor,
                    set: setBrandHeaderColor,
                  },
                  {
                    label: "Cards",
                    hint: "Fundo dos itens",
                    value: brandCardColor,
                    set: setBrandCardColor,
                  },
                  {
                    label: "Botões",
                    hint: "Cor dos botões",
                    value: brandButtonColor,
                    set: setBrandButtonColor,
                  },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="rounded-lg border border-border bg-background/60 p-3"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {c.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/80">{c.hint}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="color"
                        value={c.value}
                        onChange={(e) => c.set(e.target.value)}
                        className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-background p-1"
                        aria-label={`Selecionar ${c.label}`}
                      />
                      <input
                        type="text"
                        value={c.value}
                        onChange={(e) => c.set(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-mono outline-none focus:border-[oklch(0.78_0.13_84_/_0.5)]"
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div
                  className="flex flex-1 flex-col gap-2 rounded-xl border border-border p-4"
                  style={{ backgroundColor: brandColor, color: brandTextColor }}
                >
                  <div
                    className="-mx-2 -mt-2 rounded-lg px-3 py-2 text-xs font-medium"
                    style={{ backgroundColor: brandHeaderColor, color: brandTextColor }}
                  >
                    Cabeçalho
                  </div>
                  <div
                    className="flex items-center justify-between rounded-lg p-3"
                    style={{ backgroundColor: brandCardColor, color: brandTextColor }}
                  >
                    <span className="text-sm">Prato exemplo</span>
                    <span className="text-sm font-medium" style={{ color: brandAccentColor }}>
                      R$ 49,90
                    </span>
                  </div>
                  <button
                    type="button"
                    className="self-start rounded-full px-3 py-1.5 text-xs font-medium"
                    style={{ backgroundColor: brandButtonColor, color: "#fff" }}
                  >
                    Botão
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => saveBrandColor()}
                    disabled={savingColor || !colorsDirty}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                  >
                    {savingColor ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Salvar cores
                  </button>
                  <button
                    type="button"
                    onClick={resetBrandColors}
                    disabled={savingColor}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                  >
                    Voltar ao padrão
                  </button>
                </div>
              </div>
            </div>

            {/* Promotional banner */}
            <div className="rounded-xl border border-border bg-background/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">Banner promocional</p>
                  <p className="text-xs text-muted-foreground">
                    Exiba um banner em destaque no topo do cardápio público.
                  </p>
                </div>
                <Switch checked={bannerEnabled} onCheckedChange={setBannerEnabled} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Título
                  </label>
                  <input
                    type="text"
                    value={bannerTitle}
                    onChange={(e) => setBannerTitle(e.target.value)}
                    placeholder="Happy Hour até 19h"
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[oklch(0.78_0.13_84_/_0.5)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Rótulo do botão (opcional)
                  </label>
                  <input
                    type="text"
                    value={bannerCtaLabel}
                    onChange={(e) => setBannerCtaLabel(e.target.value)}
                    placeholder="Aproveitar"
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[oklch(0.78_0.13_84_/_0.5)]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Descrição
                  </label>
                  <textarea
                    value={bannerDescription}
                    onChange={(e) => setBannerDescription(e.target.value)}
                    placeholder="Chopp em dobro e petiscos com 20% off."
                    rows={2}
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[oklch(0.78_0.13_84_/_0.5)]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Imagem (opcional)
                  </label>
                  <div className="mt-1.5 flex items-center gap-3">
                    {bannerImageUrl ? (
                      <img
                        src={bannerImageUrl}
                        alt="Banner"
                        className="h-16 w-28 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-28 items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground">
                        Sem imagem
                      </div>
                    )}
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs hover:text-foreground">
                      {bannerUploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ImageIcon className="h-3.5 w-3.5" />
                      )}
                      Enviar imagem
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadBannerImage(f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {bannerImageUrl && (
                      <button
                        type="button"
                        onClick={() => setBannerImageUrl(null)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={saveBanner}
                  disabled={savingBanner}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                >
                  {savingBanner ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salvar banner
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TeamSection({ restaurantId, slug }: { restaurantId: string; slug: string }) {
  const { data: staff = [], isLoading } = useStaff(restaurantId);
  const create = useCreateStaff(restaurantId);
  const update = useUpdateStaff(restaurantId);
  const remove = useDeleteStaff(restaurantId);
  const [newName, setNewName] = useState("");
  const [showQr, setShowQr] = useState(false);

  const staffUrl =
    typeof window !== "undefined" ? `${window.location.origin}/staff/${slug}` : `/staff/${slug}`;

  async function add() {
    const n = newName.trim();
    if (!n) return;
    try {
      await create.mutateAsync(n);
      setNewName("");
      toast.success(`${n} adicionado(a) à equipe`);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao adicionar");
    }
  }

  function randomPin() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl tracking-tight">Gerenciar equipe</h2>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Cadastre os funcionários, defina um PIN de 4 dígitos e a função (Garçom, Cozinha ou
            ambos). Eles acessarão apenas as telas de operação, sem ver dados financeiros.
          </p>

          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border bg-background/40 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold">Link de acesso da equipe</div>
              <div className="truncate text-[11px] text-muted-foreground">{staffUrl}</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(staffUrl);
                  toast.success("Link copiado");
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface"
              >
                Copiar link
              </button>
              <button
                onClick={() => setShowQr((v) => !v)}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                {showQr ? "Ocultar" : "Gerar QR Code"}
              </button>
            </div>
          </div>

          {showQr && (
            <div className="mt-3 flex justify-center rounded-xl border border-border bg-white p-4">
              <img
                alt="QR do acesso da equipe"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(staffUrl)}`}
                className="h-56 w-56"
              />
            </div>
          )}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              placeholder="Nome do funcionário"
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-[oklch(0.78_0.13_84_/_0.5)]"
            />
            <button
              onClick={add}
              disabled={create.isPending || !newName.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Adicionar
            </button>
          </div>

          <div className="mt-5">
            {isLoading ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (staff as StaffMember[]).length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-6 text-center text-xs text-muted-foreground">
                Nenhum membro cadastrado ainda.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {(staff as StaffMember[]).map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "truncate text-sm font-medium",
                          !s.active && "text-muted-foreground line-through",
                        )}
                      >
                        {s.name}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {s.active ? "Ativo" : "Inativo"}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={s.role ?? "waiter"}
                        onChange={(e) =>
                          update.mutate({ id: s.id, patch: { role: e.target.value as any } })
                        }
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                      >
                        <option value="waiter">Garçom</option>
                        <option value="kitchen">Cozinha</option>
                        <option value="both">Garçom + Cozinha</option>
                      </select>
                      <input
                        key={s.updated_at}
                        defaultValue=""
                        aria-label={`Novo PIN de ${s.name}`}
                        type="password"
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (!v) return;
                          if (!/^\d{4}$/.test(v)) {
                            toast.error("O PIN deve ter 4 dígitos");
                            return;
                          }
                          update.mutate({ id: s.id, patch: { pin: v } });
                          e.target.value = "";
                        }}
                        placeholder="PIN"
                        maxLength={4}
                        inputMode="numeric"
                        className="w-16 rounded-md border border-border bg-background px-2 py-1 text-center text-xs tracking-widest"
                      />
                      <button
                        onClick={() => {
                          const pin = randomPin();
                          update.mutate(
                            { id: s.id, patch: { pin } },
                            {
                              onSuccess: () =>
                                toast.success(`Novo PIN: ${pin}`, { duration: 15000 }),
                            },
                          );
                        }}
                        className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                        title="Gerar PIN"
                      >
                        Gerar
                      </button>
                      <Switch
                        checked={s.active}
                        onCheckedChange={(v) => update.mutate({ id: s.id, patch: { active: v } })}
                      />
                      <button
                        onClick={() => {
                          if (confirm(`Remover ${s.name}?`)) remove.mutate(s.id);
                        }}
                        className="rounded-md border border-border p-1.5 text-muted-foreground transition hover:border-destructive/40 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
