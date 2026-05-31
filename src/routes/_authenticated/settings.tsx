import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ChefHat, Store, Check, Sparkles, Crown, Rocket } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/features/restaurant/use-restaurant";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configurações — Flux" }] }),
  component: SettingsPage,
});

type PlanId = "essential" | "pro" | "enterprise";

const PLANS: {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  icon: typeof Sparkles;
  description: string;
  features: string[];
  checkoutUrl: string;
  featured?: boolean;
}[] = [
  {
    id: "essential",
    name: "Essential",
    price: "R$ 99",
    period: "/mês",
    icon: Sparkles,
    description: "Para começar com o pé direito.",
    features: ["Até 10 mesas", "Cardápio digital com QR Code", "KDS básico", "Suporte por e-mail"],
    checkoutUrl: "https://buy.stripe.com/test_essential",
  },
  {
    id: "pro",
    name: "Pro",
    price: "R$ 199",
    period: "/mês",
    icon: Crown,
    description: "Para operações em ritmo profissional.",
    features: [
      "Mesas ilimitadas",
      "Modo Garçom + alertas sonoros",
      "Análises de pico e relatórios",
      "Bar e Cozinha separados",
      "Suporte prioritário",
    ],
    checkoutUrl: "https://buy.stripe.com/test_pro",
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
    checkoutUrl: "mailto:vendas@flux.app?subject=Plano%20Enterprise",
  },
];

function SettingsPage() {
  const { data: restaurant, isLoading } = useRestaurant();
  const qc = useQueryClient();
  const [kitchenOpen, setKitchenOpen] = useState(true);

  useEffect(() => {
    if (restaurant) setKitchenOpen((restaurant as any).kitchen_open ?? true);
  }, [restaurant]);

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

  if (isLoading || !restaurant) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Current plan — defaults to "essential" until a real billing integration is wired up.
  const currentPlan: PlanId = ((restaurant as any).plan as PlanId) ?? "essential";

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

      <Tabs defaultValue="operation" className="w-full">
        <TabsList className="bg-surface">
          <TabsTrigger value="operation">Operação</TabsTrigger>
          <TabsTrigger value="establishment">Estabelecimento</TabsTrigger>
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
          <section className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft ring-1 ring-[oklch(0.78_0.13_84_/_0.25)]">
                <Store className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-xl tracking-tight">Estabelecimento</h2>
                <p className="mt-1 text-xs text-muted-foreground">Identificação pública do seu cardápio.</p>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Nome</dt>
                    <dd className="mt-1 text-sm">{restaurant.name}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Slug</dt>
                    <dd className="mt-1 truncate text-sm">/m/{restaurant.slug}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Moeda</dt>
                    <dd className="mt-1 text-sm">{restaurant.currency}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Fuso</dt>
                    <dd className="mt-1 text-sm">{restaurant.timezone}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="billing" className="mt-6 space-y-6">
          <section className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Plano atual</p>
                <h2 className="mt-1 font-display text-2xl tracking-tight">
                  {PLANS.find((p) => p.id === currentPlan)?.name ?? "Essential"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Faturamento mensal · próximo ciclo gerenciado pelo provedor de pagamento.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-soft px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]">
                <Check className="h-3 w-3" /> Ativo
              </span>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            {PLANS.map((plan) => {
              const Icon = plan.icon;
              const isCurrent = plan.id === currentPlan;
              return (
                <div
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col rounded-2xl border bg-surface p-6 transition",
                    plan.featured
                      ? "border-[oklch(0.78_0.13_84_/_0.5)] shadow-[0_0_40px_-12px_oklch(0.78_0.13_84_/_0.4)]"
                      : "border-border",
                  )}
                >
                  {plan.featured && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                      Mais vendido
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
                  <a
                    href={plan.checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={isCurrent}
                    onClick={(e) => {
                      if (isCurrent) e.preventDefault();
                    }}
                    className={cn(
                      "mt-6 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition",
                      isCurrent
                        ? "cursor-not-allowed bg-muted text-muted-foreground"
                        : plan.featured
                          ? "bg-primary text-primary-foreground hover:opacity-90"
                          : "border border-border bg-background hover:bg-accent",
                    )}
                  >
                    {isCurrent ? "Plano atual" : "Assinar agora"}
                  </a>
                </div>
              );
            })}
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            Pagamentos processados de forma segura. Você pode cancelar ou trocar de plano a qualquer momento.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
