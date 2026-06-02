import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Lock, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/auth-provider";

export type PlanType = "trial" | "essential" | "pro" | "enterprise" | string;

type TrialInfo = {
  plan_type: PlanType;
  trial_ends_at: string;
};

export type FeatureKey = "analytics" | "waiter" | "menu" | "kitchen" | "dashboard";

// Trial behaves like Pro so users experience the full potential of Flux.
const PLAN_FEATURES: Record<string, FeatureKey[]> = {
  trial: ["analytics", "waiter", "menu", "kitchen", "dashboard"],
  pro: ["analytics", "waiter", "menu", "kitchen", "dashboard"],
  enterprise: ["analytics", "waiter", "menu", "kitchen", "dashboard"],
  essential: ["menu", "kitchen", "dashboard"],
};

export function canAccess(info: TrialInfo | null | undefined, feature: FeatureKey): boolean {
  if (!info) return true;
  if (isTrialExpired(info)) return false;
  const plan = (info.plan_type ?? "trial").toLowerCase();
  const features = PLAN_FEATURES[plan] ?? PLAN_FEATURES.essential;
  return features.includes(feature);
}

export function useTrialStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["trial-status", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<TrialInfo | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("plan_type, trial_ends_at" as any)
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as TrialInfo) ?? null;
    },
    refetchOnWindowFocus: false,
  });
}

export function isTrialExpired(info: TrialInfo | null | undefined): boolean {
  if (!info) return false;
  if (info.plan_type && info.plan_type !== "trial") return false;
  return new Date(info.trial_ends_at).getTime() < Date.now();
}

export function daysLeft(info: TrialInfo | null | undefined): number {
  if (!info) return 0;
  const ms = new Date(info.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function FeatureLocked({ feature }: { feature: FeatureKey }) {
  const labels: Record<FeatureKey, string> = {
    analytics: "Análises avançadas",
    waiter: "Rota do Garçom",
    menu: "Cardápio",
    kitchen: "Pedidos",
    dashboard: "Dashboard",
  };
  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-border bg-surface/80 p-10 text-center shadow-[0_40px_80px_-30px_oklch(0_0_0_/_0.7)]">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-soft text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]">
        <Lock className="h-6 w-6" />
      </div>
      <h2 className="mt-6 font-display text-2xl tracking-tight md:text-3xl">
        {labels[feature]} está disponível no plano Pro
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        Seu plano atual não inclui este recurso. Faça upgrade para o Pro e libere todo o potencial do Flux.
      </p>
      <Link
        to="/settings"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
      >
        <Sparkles className="h-4 w-4" />
        Fazer upgrade
      </Link>
    </div>
  );
}

export function TrialExpiredBlock() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-surface/80 p-10 text-center shadow-[0_40px_80px_-30px_oklch(0_0_0_/_0.7)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-1 rounded-[2rem] bg-[conic-gradient(from_180deg_at_50%_50%,oklch(0.78_0.13_84_/_0.35),transparent,oklch(0.78_0.13_84_/_0.35))] opacity-60 blur-xl"
      />
      <div className="relative">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-soft text-primary ring-1 ring-[oklch(0.78_0.13_84_/_0.3)]">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="mt-6 font-display text-3xl tracking-tight md:text-4xl">
          Seu período de teste acabou.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
          Escolha um plano para continuar usando o Flux e mantenha seu salão
          rodando sem interrupções.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/settings"
            search={{ tab: "billing" } as any}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-[0_18px_40px_-15px_oklch(0.78_0.13_84_/_0.6)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_25px_60px_-18px_oklch(0.78_0.13_84_/_0.75)]"
          >
            <Sparkles className="h-4 w-4" />
            Escolher um plano
          </Link>
          <a
            href="mailto:vendas@flux.app"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition hover:-translate-y-0.5 hover:border-[oklch(0.78_0.13_84_/_0.4)]"
          >
            Falar com vendas
          </a>
        </div>
      </div>
    </div>
  );
}

export function TrialBanner({ info }: { info: TrialInfo }) {
  const days = daysLeft(info);
  if (info.plan_type !== "trial") return null;
  return (
    <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-[oklch(0.78_0.13_84_/_0.3)] bg-gold-soft px-5 py-4 text-sm sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-foreground">
          Você está no período de teste —{" "}
          <strong className="font-semibold">
            {days} {days === 1 ? "dia restante" : "dias restantes"}
          </strong>
          .
        </span>
      </div>
      <Link
        to="/settings"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
      >
        Ver planos
      </Link>
    </div>
  );
}
