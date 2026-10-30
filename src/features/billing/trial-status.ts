import { useAuth } from "@/features/auth/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export type PlanType = "trial" | "essential" | "pro" | "enterprise" | string;

export type TrialInfo = {
  plan_type: PlanType;
  trial_ends_at: string;
};

export type FeatureKey = "analytics" | "waiter" | "menu" | "kitchen" | "dashboard" | "tables";

// Trial behaves like Pro so users experience the full potential of Flux Menu.
const PLAN_FEATURES: Record<string, FeatureKey[]> = {
  trial: ["analytics", "waiter", "menu", "kitchen", "dashboard", "tables"],
  pro: ["analytics", "waiter", "menu", "kitchen", "dashboard", "tables"],
  enterprise: ["analytics", "waiter", "menu", "kitchen", "dashboard", "tables"],
  essential: ["menu", "kitchen", "dashboard", "tables"],
  basic: ["menu", "dashboard"],
};

export function canAccess(info: TrialInfo | null | undefined, feature: FeatureKey): boolean {
  if (!info) return false;
  if (isTrialExpired(info)) return false;
  const plan = (info.plan_type ?? "trial").toLowerCase();
  const features = PLAN_FEATURES[plan] ?? [];
  return features.includes(feature);
}

export function useTrialStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["trial-status", user?.id],
    enabled: !!user?.id,
    retry: false,
    queryFn: async (): Promise<TrialInfo | null> => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("plan_type, trial_ends_at")
          .eq("id", user!.id)
          .maybeSingle();
        if (error) {
          console.error("[trial-status] fetch error", error);
          return null;
        }
        return data ?? null;
      } catch (e) {
        console.error("[trial-status] unexpected error", e);
        return null;
      }
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
