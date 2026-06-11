import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ChefHat, Store, Check, Sparkles, Crown, Rocket, AlertTriangle, Users, Plus, Trash2, Save, ExternalLink } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { useTrialStatus, daysLeft } from "@/features/billing/trial-guard";
import { useStaff, useCreateStaff, useUpdateStaff, useDeleteStaff, type StaffMember } from "@/features/staff/staff-queries";
import { useAuth } from "@/features/auth/auth-provider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStripeCheckout } from "@/hooks/use-stripe-checkout";
import { createPortalSession } from "@/lib/payments.functions";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";
import { PaymentTestModeBanner } from "@/components/payments/payment-test-mode-banner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (search: Record<string, unknown>): { tab?: string; plan?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    plan: typeof search.plan === "string" ? search.plan : undefined,
  }),
  head: () => ({ meta: [{ title: "Configurações — Flux" }] }),
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
    price: "R$ 20",
    period: "/mês",
    icon: Sparkles,
    description: "Cardápio digital com QR Code, sem pedidos.",
    features: ["Cardápio digital ilimitado", "QR Code para o salão", "Atualizações em tempo real"],
    priceId: "price_1ThDYwRCz3xsp5na0BjTL7Hd",
  },
  {
    id: "essential",
    name: "Essential",
    price: "R$ 99",
    period: "/mês",
    icon: Crown,
    description: "Operação digital completa para começar.",
    features: ["Pedidos por QR Code", "KDS para cozinha e bar", "Até 5 QR Codes", "Suporte por email"],
    priceId: "price_1ThDaORCz3xsp5naEai7LNVJ",
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
    priceId: "price_1ThDcMRCz3xsp5naiRcanTGKk",
    featured: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Sob consulta",
    period: "",
    icon: Rocket,
    description: "Multi-unidades e integrações sob medida.",
    features: ["Multi-unidade & franquias", "Integrações personalizadas", "SLA dedicado", "Onboarding presencial"],
    comingSoon: true,
  },
];

function SettingsPage() {
  const { tab, plan: planParam } = Route.useSearch();
  const { data: restaurant, isLoading } = useRestaurant();
  const { data: trialInfo } = useTrialStatus();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [kitchenOpen, setKitchenOpen] = useState(true);
  const { openCheckout, closeCheckout, isOpen, checkoutElement } = useStripeCheckout();
  const paymentsReady = isPaymentsConfigured();

  // Load current active subscription (if any)
  const { data: subscription } = useQuery({
    queryKey: ["subscription", user?.id],
    enabled: !!user?.id && paymentsReady,
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

  // Auto-open checkout when arriving with ?plan=basic|essential|pro or pending_plan in sessionStorage
  useEffect(() => {
    if (!paymentsReady || !user) return;
    const pending = planParam ?? (typeof window !== "undefined" ? sessionStorage.getItem("flux:pending_plan") : null);
    if (!pending) return;
    const plan = PLANS.find((p) => p.id === pending && p.priceId);
    if (!plan?.priceId) return;
    if (typeof window !== "undefined") sessionStorage.removeItem("flux:pending_plan");
    openCheckout({
      priceId: plan.priceId,
      customerEmail: user.email,
      userId: user.id,
      returnUrl: `${window.location.origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planParam, paymentsReady, user?.id]);

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

  async function handleSubscribe(plan: typeof PLANS[number]) {
    if (!plan.priceId) return;
    if (!paymentsReady) {
      toast.error("Pagamentos não configurados nesta build.");
      return;
    }
    openCheckout({
      priceId: plan.priceId,
      customerEmail: user?.email,
      userId: user?.id,
      returnUrl: `${window.location.origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    });
  }

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

  if (isLoading || !restaurant) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
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

      <Tabs key={tab ?? (planParam ? "billing" : "operation")} defaultValue={tab ?? (planParam ? "billing" : "operation")} className="w-full">
        <TabsList className="bg-surface">
          <TabsTrigger value="operation">Operação</TabsTrigger>
          <TabsTrigger value="establishment">Estabelecimento</TabsTrigger>
          <TabsTrigger value="team">Equipe</TabsTrigger>
          <TabsTrigger value="billing">Assinatura</TabsTrigger>
        </TabsList>

        <TabsContent value="operation" className="mt-6">
          <section className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
                  <ChefHat className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-xl tracking-tight">Cozinha</h2>
                  <p className="mt-1 max-w-md text-xs text-muted-foreground">
                    Quando fechada, itens de comida são automaticamente desabilitados no cardápio público.
                    Apenas bebidas continuam disponíveis para pedido.
                  </p>
                  <p className="mt-3 text-sm">
                    Status:{" "}
                    <span className={kitchenOpen ? "font-medium text-emerald-400" : "font-medium text-[oklch(0.78_0.18_25)]"}>
                      {kitchenOpen ? "Aberta" : "Fechada"}
                    </span>
                  </p>
                </div>
              </div>
              <Switch checked={kitchenOpen} onCheckedChange={toggleKitchen} disabled={update.isPending} />
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
          />
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <TeamSection restaurantId={restaurant.id} />
        </TabsContent>


        <TabsContent value="billing" className="mt-6 space-y-6">
          <PaymentTestModeBanner />

          <section className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Plano atual</p>
                <h2 className="mt-1 font-display text-2xl tracking-tight">
                  {effectivePlanName}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isTrial
                    ? `Período de teste — ${trialDays} ${trialDays === 1 ? "dia restante" : "dias restantes"}.`
                    : subscription?.current_period_end
                      ? `Próxima cobrança em ${new Date(subscription.current_period_end as string).toLocaleDateString("pt-BR")}.`
                      : "Faturamento mensal recorrente."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-soft px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]">
                  <Check className="h-3 w-3" /> Ativo
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
                Você está no plano <strong className="font-semibold">Trial</strong>. Faça o upgrade para liberar todas as funções.
              </p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => {
              const Icon = plan.icon;
              const isCurrent = !isTrial && plan.id === currentPlanId;
              const disabled = plan.comingSoon || isCurrent;
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
                    {plan.period && <span className="text-xs text-muted-foreground">{plan.period}</span>}
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
                    onClick={() => handleSubscribe(plan)}
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
                    {isCurrent ? "Plano atual" : plan.comingSoon ? "Em breve" : "Assinar agora"}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            Pagamentos processados de forma segura. Você pode cancelar ou trocar de plano a qualquer momento.
          </p>
        </TabsContent>
      </Tabs>

      <Dialog open={isOpen} onOpenChange={(o) => !o && closeCheckout()}>
        <DialogContent className="max-w-2xl p-0 sm:max-w-3xl">
          <DialogHeader className="border-b border-border p-4">
            <DialogTitle className="font-display text-lg tracking-tight">Finalizar assinatura</DialogTitle>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-y-auto p-2">
            {checkoutElement}
          </div>
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
}: {
  restaurantId: string;
  initialName: string;
  slug: string;
  currency: string;
  timezone: string;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(initialName);
  useEffect(() => setName(initialName), [initialName]);

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Informe um nome");
      const { error } = await supabase.from("restaurants").update({ name: trimmed }).eq("id", restaurantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["restaurant"] });
      qc.invalidateQueries({ queryKey: ["public-menu"] });
      toast.success("Nome atualizado");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });

  const dirty = name.trim() !== initialName.trim();

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
          <Store className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl tracking-tight">Estabelecimento</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Este nome aparece no Dashboard, na navegação e no cardápio público do cliente.
          </p>
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
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
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
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Moeda</dt>
                <dd className="mt-1 text-sm">{currency}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Fuso</dt>
                <dd className="mt-1 text-sm">{timezone}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

function TeamSection({ restaurantId }: { restaurantId: string }) {
  const { data: staff = [], isLoading } = useStaff(restaurantId);
  const create = useCreateStaff(restaurantId);
  const update = useUpdateStaff(restaurantId);
  const remove = useDeleteStaff(restaurantId);
  const [newName, setNewName] = useState("");

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

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl tracking-tight">Gerenciar equipe</h2>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Cadastre os nomes dos garçons e atendentes. Ao lançar um pedido ou marcar como entregue,
            a equipe escolhe seu nome — assim você vê exatamente quem atendeu cada mesa.
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              placeholder="Nome do garçom"
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-[oklch(0.78_0.13_84_/_0.5)]"
            />
            <button
              onClick={add}
              disabled={create.isPending || !newName.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
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
                  <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className={cn("truncate text-sm font-medium", !s.active && "text-muted-foreground line-through")}>
                        {s.name}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {s.active ? "Ativo" : "Inativo"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
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

